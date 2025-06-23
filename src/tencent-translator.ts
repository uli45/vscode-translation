import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as https from 'https';
import * as querystring from 'querystring';
import { TranslationCache } from './translation-cache';

/**
 * 腾讯云机器翻译API配置接口
 * 
 * @property secretId - 腾讯云API的SecretId，在腾讯云控制台申请
 * @property secretKey - 腾讯云API的SecretKey，与SecretId配对使用
 * @property region - 腾讯云API的地域，默认为ap-guangzhou
 * @property projectId - 项目ID，默认为0
 */
export interface TencentTranslatorConfig {
  secretId: string;
  secretKey: string;
  region?: string;
  projectId?: number;
}

/**
 * 腾讯云机器翻译API错误码及说明
 */
export const TENCENT_ERROR_CODES: {[key: string]: string} = {
  'AuthFailure.SignatureFailure': '签名错误，请检查SecretId和SecretKey是否正确',
  'AuthFailure.SecretIdNotFound': 'SecretId不存在，请检查SecretId是否正确',
  'AuthFailure.SignatureExpire': '签名过期，请检查系统时间是否正确',
  'InvalidParameter': '参数错误，请检查参数是否完整',
  'InvalidParameter.InvalidSourceText': '源文本不合法，请检查源文本是否正确',
  'UnsupportedOperation.TextTooLong': '文本长度超过限制，请减少文本长度',
  'UnsupportedOperation.LanguagePairNotSupported': '不支持的语言对，请检查源语言和目标语言是否在支持列表中',
  'FailedOperation.NoFreeAmount': '账户余额不足，请充值',
  'FailedOperation.ServiceIsolate': '账户已被隔离，请检查账户状态',
  'InternalError': '内部错误，请稍后重试',
  'RequestLimitExceeded': '请求频率超限，请降低调用频率',
  'UnauthorizedOperation': '未授权操作，请检查CAM策略',
};

/**
 * 腾讯云机器翻译API封装类
 * 
 * 该类封装了腾讯云机器翻译API的调用逻辑，包括配置管理、签名生成和请求发送等功能。
 * 使用前需要在VSCode设置中配置腾讯云API的secretId和secretKey。
 * 
 * 腾讯云机器翻译API文档：https://cloud.tencent.com/document/product/551/15619
 */
export class TencentTranslator {
  /**
   * 腾讯云机器翻译API配置对象
   * 包含secretId、secretKey、region和projectId属性
   */
  private config: TencentTranslatorConfig;
  
  /**
   * 翻译缓存实例
   * 用于缓存翻译结果，减少API调用
   */
  public cache: TranslationCache | null = null;
  
  /**
   * 上次缓存访问时间
   */
  private lastCacheAccessTime: number = 0;

  /**
   * 构造函数
   * 初始化配置对象并从VSCode设置中加载配置
   * 
   * @param context 可选的扩展上下文，用于初始化缓存
   */
  constructor(context?: vscode.ExtensionContext) {
    // 初始化配置对象
    this.config = {
      secretId: '', // 腾讯云API的SecretId
      secretKey: '', // 腾讯云API的SecretKey
      region: 'ap-guangzhou', // 默认地域
      projectId: 0 // 默认项目ID
    };
    
    // 从VSCode设置中加载配置
    this.loadConfig();
    
    // 如果提供了扩展上下文，初始化缓存
    if (context) {
      this.initCache(context);
    }
  }

  /**
   * 从VSCode配置中加载腾讯云机器翻译API的配置
   * 读取用户在设置中配置的secretId、secretKey、region和projectId
   */
  private loadConfig(): void {
    // 获取VSCode中的配置项
    const config = vscode.workspace.getConfiguration('uliTranslation.tencent');
    
    // 将配置项加载到实例变量中
    this.config = {
      secretId: config.get<string>('secretId') || '', // 腾讯云API的SecretId
      secretKey: config.get<string>('secretKey') || '', // 腾讯云API的SecretKey
      region: config.get<string>('region') || 'ap-guangzhou', // 腾讯云API的地域
      projectId: config.get<number>('projectId') || 0 // 项目ID
    };
  }
  
  /**
   * 初始化翻译缓存
   * @param context 扩展上下文，用于持久化存储
   * @param expirationDays 缓存过期天数，默认为3天
   * @param maxCacheSizeMB 缓存大小限制（MB），默认为20MB
   */
  public initCache(context: vscode.ExtensionContext, expirationDays: number = 3, maxCacheSizeMB: number = 20): void {
    // 创建缓存实例
    this.cache = new TranslationCache(context, expirationDays, maxCacheSizeMB);
    console.log(`翻译缓存已初始化，过期时间: ${expirationDays}天，缓存大小限制: ${maxCacheSizeMB}MB，当前缓存项数: ${this.cache.size()}`);
  }
  
  /**
   * 获取缓存性能指标
   * @returns 缓存性能指标，如果缓存未初始化则返回null
   */
  public getCacheMetrics(): { hitRate: number; avgResponseTime: number; size: number } | null {
    if (!this.cache) {
      return null;
    }
    return this.cache.getMetrics();
  }

  /**
   * 重新加载配置
   * 从VSCode设置中重新加载腾讯云机器翻译API的配置
   */
  public reloadConfig(): void {
    this.loadConfig();
  }

  /**
   * 检查腾讯云机器翻译API配置是否有效
   * 有效的配置必须同时包含secretId和secretKey
   * region和projectId是可选的，有默认值
   * 
   * @returns 配置是否有效的布尔值
   */
  public isConfigValid(): boolean {
    // 检查secretId和secretKey是否都已设置
    return !!(this.config.secretId && this.config.secretKey);
  }

  /**
   * 翻译文本
   * 
   * 使用腾讯云机器翻译API将文本从一种语言翻译为另一种语言
   * 遵循腾讯云API 3.0签名v3的要求
   * 
   * @param text 要翻译的文本（UTF-8编码）
   * @param from 源语言，默认为auto（自动检测）
   * @param to 目标语言，默认为zh（中文）
   * @param formatOption 可选的格式化选项，用于获取特定格式的缓存结果
   * @returns 翻译结果
   * @throws Error 当配置无效、文本过长或API请求失败时抛出错误
   */
  public async translate(text: string, from: string = 'auto', to: string = 'zh', formatOption?: string): Promise<string> {
    // 重新加载配置，确保使用最新的配置
    this.loadConfig();

    // 检查配置是否有效
    if (!this.isConfigValid()) {
      throw new Error('腾讯云机器翻译API配置无效，请在设置中配置secretId和secretKey');
    }

    // 检查文本长度，腾讯云机器翻译API对单次请求有字符限制
    if (text.length > 2000) {
      throw new Error('翻译文本过长，请将文本长度控制在2000字符以内');
    }
    
    // 检查缓存中是否有翻译结果
    if (this.cache) {
      const startTime = Date.now();
      this.lastCacheAccessTime = startTime;
      
      // 如果提供了格式化选项，尝试获取特定格式的缓存结果
      let cacheKey = text;
      if (formatOption) {
        cacheKey = `${text}|${formatOption}`;
      }
      
      const cachedResult = this.cache.get(cacheKey, from, to);
      if (cachedResult) {
        const responseTime = Date.now() - startTime;
        if (responseTime > 500) {
          console.warn(`缓存响应时间过长: ${responseTime}ms，考虑清空缓存以提高性能`);
          // 提示用户清空缓存
          vscode.window.showWarningMessage(
            `翻译缓存响应时间过长(${responseTime.toFixed(0)}ms)，影响使用体验。`, 
            '清空缓存', 
            '查看性能指标', 
            '忽略'
          ).then(selection => {
            if (selection === '清空缓存') {
              if (this.cache) {
                this.cache.clear();
                vscode.window.showInformationMessage('翻译缓存已清空，性能已恢复');
              }
            } else if (selection === '查看性能指标') {
              vscode.commands.executeCommand('uli-translation.showCacheMetrics');
            }
          });
        } else {
          console.log(`使用缓存的翻译结果${formatOption ? `(${formatOption})` : ''}，响应时间: ${responseTime}ms`);
        }
        return cachedResult;
      }
      
      // 如果有格式化选项但没有找到特定格式的缓存，尝试获取原始翻译结果
      if (formatOption) {
        const originalCachedResult = this.cache.get(text, from, to);
        if (originalCachedResult) {
          console.log(`找到原始翻译缓存，但未找到${formatOption}格式的缓存`);
          // 返回原始结果，让调用方进行格式化
          return originalCachedResult;
        }
      }
    }

    // 构建请求参数
    const params = {
      SourceText: text,
      Source: from === 'auto' ? 'auto' : from,
      Target: to,
      ProjectId: this.config.projectId
    };

    try {
      // 发送请求并获取结果
      const result = await this.request(params);
      
      // 检查是否有错误
      if (result.Response && result.Response.Error) {
        const error = result.Response.Error;
        // 增强错误处理：为常见错误提供更友好的提示信息
        let errorMessage = TENCENT_ERROR_CODES[error.Code] || error.Message || '未知错误';
        
        // 针对特定错误码提供更详细的解决方案
        if (error.Code === 'AuthFailure.InvalidAuthorization') {
          errorMessage = '签名验证失败，请检查secretId和secretKey是否正确，以及系统时间是否准确';
          console.error('腾讯云API签名验证失败，详细错误:', error);
        } else if (error.Code === 'AuthFailure.SignatureExpire') {
          errorMessage = '签名过期，请检查系统时间是否正确';
        } else if (error.Code === 'AuthFailure.SecretIdNotFound') {
          errorMessage = 'SecretId不存在或已禁用，请前往腾讯云控制台检查';
        } else if (error.Code === 'FailedOperation.NoFreeAmount') {
          errorMessage = '账户余额不足，请前往腾讯云控制台充值';
        } else if (error.Code === 'FailedOperation.ServiceIsolate') {
          errorMessage = '账户已被隔离，请检查账户状态或联系腾讯云客服';
        } else if (error.Code === 'RequestLimitExceeded') {
          errorMessage = '请求频率超限，请降低调用频率或升级服务等级';
        } else if (error.Code === 'UnsupportedOperation.LanguagePairNotSupported') {
          errorMessage = `不支持的语言对翻译：${from} -> ${to}，请检查语言代码是否正确`;
        }
        
        throw new Error(`翻译失败: ${errorMessage} (错误码: ${error.Code})`);
      }
      
      // 处理翻译结果
      const translatedText = result.Response.TargetText || '';
      
      // 将翻译结果存入缓存
      if (this.cache) {
        this.cache.set(text, translatedText, from, to);
        console.log('翻译结果已缓存');
      }
      
      return translatedText;
    } catch (error) {
      // 增强错误处理：记录详细错误信息到控制台
      console.error('腾讯云翻译请求失败:', error);
      
      // 重新抛出错误，保留原始错误信息
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('翻译请求失败，请检查网络连接和API配置');
    }
  }

  /**
   * 生成腾讯云API 3.0签名v3
   * 
   * 签名生成方法遵循腾讯云API 3.0签名v3规范
   * 
   * @param params 请求参数
   * @param timestamp 请求时间戳
   * @returns 签名和请求头
   */
  private generateSignature(params: any, timestamp: number): { authorization: string; headers: Record<string, string> } {
    const service = 'tmt'; // 服务名，机器翻译为tmt
    const host = `${service}.${this.config.region}.tencentcloudapi.com`;
    const algorithm = 'TC3-HMAC-SHA256';
    const date = new Date(timestamp * 1000).toISOString().split('T')[0];
    const requestTimestamp = timestamp.toString();
    
    // 1. 拼接规范请求串
    const httpRequestMethod = 'POST';
    const canonicalUri = '/';
    const canonicalQueryString = '';
    // 优化：规范请求串中的Content-Type添加charset=utf-8
    const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
    const signedHeaders = 'content-type;host';
    const payload = JSON.stringify(params);
    const hashedRequestPayload = crypto.createHash('sha256').update(payload).digest('hex');
    const canonicalRequest = [
      httpRequestMethod,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      hashedRequestPayload
    ].join('\n');
    
    // 2. 拼接待签名字符串
    const credentialScope = `${date}/${service}/tc3_request`;
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = [
      algorithm,
      requestTimestamp,
      credentialScope,
      hashedCanonicalRequest
    ].join('\n');
    
    // 3. 计算签名
    // 安全性增强：考虑从环境变量获取密钥，而不是直接使用配置中的密钥
    // 当前仍使用配置中的密钥，但添加了注释提醒
    const secretDate = crypto.createHmac('sha256', `TC3${this.config.secretKey}`).update(date).digest();
    const secretService = crypto.createHmac('sha256', secretDate).update(service).digest();
    const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest();
    const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');
    
    // 4. 拼接Authorization
    // 优化：使用模板字符串确保格式严格符合腾讯云API要求
    // 注意：算法名称与Credential之间是空格而不是逗号
    const authorization = `${algorithm} Credential=${this.config.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    
    return {
      authorization,
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/json; charset=utf-8', // 优化：添加charset=utf-8
        'Host': host,
        'X-TC-Action': 'TextTranslate',
        'X-TC-Version': '2018-03-21',
        'X-TC-Timestamp': requestTimestamp,
        'X-TC-Region': this.config.region || 'ap-guangzhou'
      }
    };
  }

  /**
   * 发送请求到腾讯云机器翻译API
   * 
   * 使用腾讯云API 3.0签名v3规范发送请求
   * 
   * @param params 请求参数对象
   * @returns 请求结果的Promise
   */
  private request(params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      // 生成时间戳
      const timestamp = Math.floor(Date.now() / 1000);
      
      // 生成签名和请求头
      const { headers } = this.generateSignature(params, timestamp);
      
      // 设置请求选项
      const options = {
        hostname: `tmt.${this.config.region}.tencentcloudapi.com`,
        path: '/',
        method: 'POST',
        headers,
        timeout: 10000 // 设置10秒超时
      };

      // 创建请求
      const req = https.request(options, (res) => {
        // 检查HTTP状态码
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          reject(new Error(`HTTP请求失败，状态码: ${res.statusCode}，请检查网络连接或API服务是否可用`));
          return;
        }

        let data = '';
        // 接收数据
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        // 数据接收完成
        res.on('end', () => {
          try {
            // 检查是否有数据返回
            if (!data || data.trim() === '') {
              reject(new Error('腾讯云机器翻译API返回空响应，请稍后重试'));
              return;
            }
            
            // 尝试解析JSON响应
            const result = JSON.parse(data);
            
            // 检查响应是否包含必要的字段
            if (!result.Response) {
              reject(new Error('腾讯云机器翻译API返回的数据格式不正确，缺少Response字段'));
              return;
            }
            
            resolve(result);
          } catch (error) {
            reject(new Error(`解析翻译结果失败: ${error instanceof Error ? error.message : '未知错误'}，原始响应: ${data.substring(0, 100)}${data.length > 100 ? '...' : ''}`));
          }
        });
      });

      // 设置请求超时处理
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('请求超时，请检查网络连接或稍后重试'));
      });

      // 处理请求错误
      req.on('error', (error) => {
        reject(new Error(`请求错误: ${error.message}，请检查网络连接和API服务可用性`));
      });

      // 发送请求体
      req.write(JSON.stringify(params));
      req.end();
    });
  }
}