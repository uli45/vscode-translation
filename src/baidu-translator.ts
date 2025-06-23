import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as https from 'https';
import * as querystring from 'querystring';
import { TranslationCache } from './translation-cache';

/**
 * 百度翻译API配置接口
 * 
 * @property appid - 百度翻译API的APPID，在百度翻译开放平台申请
 * @property key - 百度翻译API的密钥，与APPID配对使用
 * @property salt - 随机字符串，用于生成签名，可选（如不提供将自动生成）
 */
export interface BaiduTranslatorConfig {
  appid: string;
  key: string;
  salt?: string;
}

/**
 * 百度翻译API错误码及说明
 */
export const BAIDU_ERROR_CODES: {[key: string]: string} = {
  '52000': '成功',
  '52001': '请求超时，请重试',
  '52002': '系统错误，请重试',
  '52003': '未授权用户，请检查appid是否正确或者服务是否开通',
  '54000': '必填参数为空，请检查是否少传参数',
  '54001': '签名错误，请检查签名生成方法',
  '54003': '访问频率受限，请降低调用频率或进行身份认证后切换为高级版/尊享版',
  '54004': '账户余额不足，请前往管理控制台为账户充值',
  '54005': '长query请求频繁，请降低长query的发送频率，3秒后再试',
  '58000': '客户端IP非法，请检查个人资料里填写的IP地址是否正确',
  '58001': '译文语言方向不支持，请检查译文语言是否在语言列表里',
  '58002': '服务当前已关闭，请前往管理控制台开启服务',
  '58003': 'IP被封禁，可能是因为同一IP使用了多个APPID，请发送邮件至translate_api@baidu.com申请解封',
  '90107': '认证未通过或未生效，请前往百度翻译开放平台查看认证进度'
};

/**
 * 百度翻译API封装类
 * 
 * 该类封装了百度翻译API的调用逻辑，包括配置管理、签名生成和请求发送等功能。
 * 使用前需要在VSCode设置中配置百度翻译API的appid和key。
 * 
 * 百度翻译API文档：https://fanyi-api.baidu.com/doc/21
 */
export class BaiduTranslator {
  /**
   * 百度翻译API配置对象
   * 包含appid、key和salt三个属性
   */
  private config: BaiduTranslatorConfig;
  
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
      appid: '', // 百度翻译API的APPID
      key: '',   // 百度翻译API的密钥
      salt: ''   // 可选的盐值，用于签名
    };
    
    // 从VSCode设置中加载配置
    this.loadConfig();
    
    // 如果提供了扩展上下文，初始化缓存
    if (context) {
      this.initCache(context);
    }
  }

  /**
   * 从VSCode配置中加载百度翻译API的配置
   * 读取用户在设置中配置的appid、key和salt
   */
  private loadConfig(): void {
    // 获取VSCode中的配置项
    const config = vscode.workspace.getConfiguration('uliTranslation.baidu');
    
    // 将配置项加载到实例变量中
    this.config = {
      appid: config.get<string>('appid') || '', // 百度翻译API的APPID
      key: config.get<string>('key') || '',     // 百度翻译API的密钥
      salt: config.get<string>('salt') || ''    // 可选的盐值，用于签名
    };
  }
  
  /**
   * 初始化翻译缓存
   * @param context 扩展上下文，用于持久化存储
   * @param expirationDays 缓存过期天数，默认为3天
   * @param maxCacheSizeMB 缓存大小限制（MB），默认为50MB
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
   * 从VSCode设置中重新加载百度翻译API的配置
   */
  public reloadConfig(): void {
    this.loadConfig();
  }

  /**
   * 检查百度翻译API配置是否有效
   * 有效的配置必须同时包含appid和key
   * salt是可选的，如果未设置会自动生成
   * 
   * @returns 配置是否有效的布尔值
   */
  public isConfigValid(): boolean {
    // 检查appid和key是否都已设置
    // 注意：salt是可选的，不影响配置有效性
    return !!(this.config.appid && this.config.key);
  }

  /**
   * 翻译文本
   * 
   * 使用百度翻译API将文本从一种语言翻译为另一种语言
   * 遵循百度翻译API的签名和编码要求：
   * 1. 签名生成：MD5(appid+q+salt+密钥)，其中q为原始文本，不做URL编码
   * 2. 发送请求时，q参数需要做URL编码
   * 3. 文本必须为UTF-8编码
   * 4. 单次请求文本长度不超过2000字符
   * 5. 多个query可以用\n连接，如 query='apple\norange\nbanana\npear'
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
      throw new Error('百度翻译API配置无效，请在设置中配置appid和key');
    }

    // 检查文本长度，百度翻译API要求单次请求不超过2000字符
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

    // 如果没有设置salt，则使用随机数
    // salt是签名过程中使用的随机字符串，可以在设置中固定，也可以随机生成
    const salt = this.config.salt || Math.random().toString(36).substr(2);
    
    // 生成签名
    const sign = this.generateSign(text, salt);

    // 构建请求参数
    // 百度翻译API参数说明：
    // q: 请求翻译的文本
    // from: 源语言，auto为自动检测
    // to: 目标语言
    // appid: 百度翻译API的APPID
    // salt: 随机数
    // sign: MD5(appid+q+salt+密钥)生成的签名
    const params = {
      q: text,
      from,
      to,
      appid: this.config.appid,
      salt,
      sign
    };

    try {
      // 发送请求并获取结果
      const result = await this.request(params);
      
      // 检查是否有错误码
      if (result.error_code) {
        // 使用导出的错误码常量获取错误信息
        const errorMessage = BAIDU_ERROR_CODES[result.error_code] || result.error_msg || '未知错误';
        throw new Error(`翻译失败: ${errorMessage} (错误码: ${result.error_code})`);
      }
      
      // 处理翻译结果，将多行结果合并
      const translatedText = result.trans_result.map((item: any) => item.dst).join('\n');
      
      // 将翻译结果存入缓存
      if (this.cache) {
        this.cache.set(text, translatedText, from, to);
        console.log('翻译结果已缓存');
      }
      
      return translatedText;
    } catch (error) {
      // 重新抛出错误，保留原始错误信息
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('翻译请求失败');
    }
  }

  /**
   * 生成百度翻译API所需的签名
   * 
   * 签名生成方法：计算 appid+q+salt+密钥 的MD5值
   * 重要说明：
   * 1. 在生成签名时，q参数（待翻译文本）不需要做URL编码
   * 2. 签名生成后，发送HTTP请求时才需要对q参数进行URL编码
   * 3. 很多开发者遇到54001签名错误，是因为在生成签名前就对q做了URL编码
   * 
   * 详见百度翻译API文档：https://fanyi-api.baidu.com/doc/21
   * 
   * @param text 要翻译的文本（未经URL编码的原始文本）
   * @param salt 随机数或随机字符串
   * @returns MD5签名字符串（32位十六进制小写）
   */
  private generateSign(text: string, salt: string): string {
    // 按照百度翻译API要求，签名=MD5(appid+q+salt+密钥)
    // 注意：这里直接使用text，不进行URL编码
    const str = this.config.appid + text + salt + this.config.key;
    
    // 使用crypto模块计算MD5值并返回十六进制小写字符串
    return crypto.createHash('md5').update(str).digest('hex');
  }

  /**
   * 发送请求到百度翻译API
   * 
   * 注意：根据百度翻译API文档要求
   * 1. 生成签名时，q参数不需要做URL编码
   * 2. 发送HTTP请求时，q参数需要做URL编码
   * 3. 本实现使用Node.js的https模块，而百度官方示例使用jQuery的ajax方法
   *    但签名生成和参数构建的原理是一致的
   * 4. querystring.stringify会自动对所有参数进行URL编码，符合API要求
   * 5. 请求可能返回多种错误码，详见BAIDU_ERROR_CODES常量
   * 
   * @param params 请求参数对象，包含q、from、to、appid、salt和sign
   * @returns 请求结果的Promise
   */
  private request(params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      // 将参数对象转换为URL查询字符串
      // querystring.stringify会自动对所有参数进行URL编码，符合百度翻译API的要求
      // 注意：此时q参数会被正确地进行URL编码，而在生成签名时我们没有对q进行编码
      const queryStr = querystring.stringify(params);
      
      // 设置请求选项
      // 根据百度翻译API文档，可以使用GET或POST方式
      // 这里使用GET方式，适合短文本翻译（一般不超过2000字符）
      const options = {
        hostname: 'api.fanyi.baidu.com',
        path: `/api/trans/vip/translate?${queryStr}`,
        method: 'GET',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'VSCode-UliTranslation-Extension',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache'
        },
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
              reject(new Error('百度翻译API返回空响应，请稍后重试'));
              return;
            }
            
            // 尝试解析JSON响应
            const result = JSON.parse(data);
            
            // 检查响应是否包含必要的字段
            if (!result.error_code && (!result.trans_result || !Array.isArray(result.trans_result) || result.trans_result.length === 0)) {
              reject(new Error('百度翻译API返回的数据格式不正确，缺少翻译结果'));
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

      // 发送请求
      req.end();
    });
  }
}