/**
 * VSCode翻译插件 - 支持百度翻译API和腾讯云机器翻译API
 * 
 * 该插件允许用户选择文本并使用翻译API进行翻译
 * 支持在VSCode设置中配置百度翻译API和腾讯云机器翻译API
 * 
 * @author uli
 * @version 1.1.0
 */

// VSCode扩展API
import * as vscode from "vscode";
// 百度翻译API封装
import { BaiduTranslator } from "./baidu-translator";
// 腾讯云机器翻译API封装
import { TencentTranslator } from "./tencent-translator";
// 工具函数
import { escapeHtml } from "./utils";

/**
 * 格式化字节大小为人类可读的格式
 * @param bytes 字节数
 * @returns 格式化后的大小字符串
 */
function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * 插件激活函数
 * 当插件首次激活时调用此函数
 * 
 * @param context 扩展上下文，用于注册命令和管理资源
 */
export async function activate(context: vscode.ExtensionContext) {
  // 输出诊断信息到控制台
  console.log(
    'Congratulations, your extension "uli-translation" is now active!'
  );

  // 创建百度翻译器实例，并传入扩展上下文以启用缓存功能
  const baiduTranslator = new BaiduTranslator(context);
  
  // 创建腾讯翻译器实例，并传入扩展上下文以启用缓存功能
  const tencentTranslator = new TencentTranslator(context);
  
  // 从配置中读取缓存设置
  const config = vscode.workspace.getConfiguration('uliTranslation.cache');
  const expirationDays = config.get<number>('expirationDays') || 3;
  const maxCacheSizeMB = config.get<number>('maxSizeMB') || 20;
  
  // 初始化翻译缓存，使用配置的过期时间和大小限制
  baiduTranslator.initCache(context, expirationDays, maxCacheSizeMB);
  tencentTranslator.initCache(context, expirationDays, maxCacheSizeMB);
  
  // 设置定时器，每30分钟记录一次缓存性能指标
  const cacheMetricsInterval = setInterval(() => {
    const baiduMetrics = baiduTranslator.getCacheMetrics();
    if (baiduMetrics) {
      console.log(`百度翻译缓存性能指标 - 命中率: ${baiduMetrics.hitRate.toFixed(2)}%, 平均响应时间: ${baiduMetrics.avgResponseTime.toFixed(2)}ms, 缓存大小: ${formatSize(baiduMetrics.size)}`); 
    }
    
    const tencentMetrics = tencentTranslator.getCacheMetrics();
    if (tencentMetrics) {
      console.log(`腾讯翻译缓存性能指标 - 命中率: ${tencentMetrics.hitRate.toFixed(2)}%, 平均响应时间: ${tencentMetrics.avgResponseTime.toFixed(2)}ms, 缓存大小: ${formatSize(tencentMetrics.size)}`); 
    }
  }, 30 * 60 * 1000); // 30分钟
  
  // 将定时器添加到订阅列表，确保插件停用时正确清理
  context.subscriptions.push({ dispose: () => clearInterval(cacheMetricsInterval) });
  
  // 检查是否首次安装或配置无效，并提示用户进行配置
  const baiduConfigValid = await checkAndPromptForConfiguration(baiduTranslator, 'baidu');
  const tencentConfigValid = await checkAndPromptForConfiguration(tencentTranslator, 'tencent');
  
  // 检查快捷键是否与其他扩展冲突
  checkKeybindingConflicts();
  
  // 监听配置变更
  const configListener = vscode.workspace.onDidChangeConfiguration(async (event) => {
    // 检查是否修改了百度翻译API相关配置
    const affectsBaiduConfig = event.affectsConfiguration('uliTranslation.baidu');
    
    // 如果修改了百度翻译API配置，则重新检查配置有效性
     if (affectsBaiduConfig) {
       // 重新加载百度翻译器配置
       baiduTranslator.reloadConfig();
       // 检查配置并提示用户
       await checkAndPromptForConfiguration(baiduTranslator, 'baidu', false);
     }
     
     // 检查是否修改了腾讯翻译API相关配置
     const affectsTencentConfig = event.affectsConfiguration('uliTranslation.tencent');
     
     // 如果修改了腾讯翻译API配置，则重新检查配置有效性
     if (affectsTencentConfig) {
       // 重新加载腾讯翻译器配置
       tencentTranslator.reloadConfig();
       // 检查配置并提示用户
       await checkAndPromptForConfiguration(tencentTranslator, 'tencent', false);
     }
    
    // 检查是否修改了缓存相关配置
    const affectsCacheConfig = event.affectsConfiguration('uliTranslation.cache');
    
    // 如果修改了缓存配置，则重新初始化缓存
    if (affectsCacheConfig) {
      // 获取新的缓存配置
      const config = vscode.workspace.getConfiguration('uliTranslation.cache');
      const expirationDays = config.get<number>('expirationDays') || 3;
      const maxCacheSizeMB = config.get<number>('maxSizeMB') || 20;
      
      // 重新初始化百度翻译器的缓存
      baiduTranslator.initCache(context, expirationDays, maxCacheSizeMB);
      // 重新初始化腾讯翻译器的缓存
      tencentTranslator.initCache(context, expirationDays, maxCacheSizeMB);
      console.log(`缓存配置已更新：过期时间=${expirationDays}天，大小限制=${maxCacheSizeMB}MB`);
    }
    
    // 检查是否修改了默认翻译器配置
    const affectsDefaultTranslator = event.affectsConfiguration('uliTranslation.defaultTranslator');
    
    // 如果修改了默认翻译器配置，则记录日志
    if (affectsDefaultTranslator) {
      const config = vscode.workspace.getConfiguration('uliTranslation');
      const defaultTranslator = config.get<string>('defaultTranslator', 'baidu');
      console.log(`默认翻译器已更改为: ${defaultTranslator}`);
    }
  });
  
  // 将配置监听器添加到订阅列表，确保插件停用时正确清理
  context.subscriptions.push(configListener);


  /**
   * 注册显示缓存性能指标的命令
   * 该命令显示当前缓存的命中率、响应时间和大小等性能指标
   */
  const showCacheMetricsDisposable = vscode.commands.registerCommand(
    "uli-translation.showCacheMetrics",
    async () => {
      // 获取百度翻译缓存性能指标
      const baiduMetrics = baiduTranslator.getCacheMetrics();
      // 获取腾讯翻译缓存性能指标
      const tencentMetrics = tencentTranslator.getCacheMetrics();
      
      if (baiduMetrics || tencentMetrics) {
        let message = "缓存性能指标:\n";
        
        // 添加百度翻译缓存性能指标
        if (baiduMetrics) {
          message += `\n百度翻译缓存:\n- 命中率: ${baiduMetrics.hitRate.toFixed(2)}%\n- 平均响应时间: ${baiduMetrics.avgResponseTime.toFixed(2)}ms\n- 缓存大小: ${formatSize(baiduMetrics.size)}\n`;
        }
        
        // 添加腾讯翻译缓存性能指标
        if (tencentMetrics) {
          message += `\n腾讯云翻译缓存:\n- 命中率: ${tencentMetrics.hitRate.toFixed(2)}%\n- 平均响应时间: ${tencentMetrics.avgResponseTime.toFixed(2)}ms\n- 缓存大小: ${formatSize(tencentMetrics.size)}`;
        }
        
        // 显示性能指标
        await vscode.window.showInformationMessage(message, { modal: true });
        console.log(message);
      } else {
        vscode.window.showWarningMessage("缓存未初始化或无性能数据");
      }
    }
  );
  
  /**
   * 注册清空缓存命令
   * 该命令清空所有翻译缓存
   */
  const clearCacheDisposable = vscode.commands.registerCommand(
    "uli-translation.clearCache",
    () => {
      let cacheCleared = false;
      
      // 清空百度翻译缓存
      if (baiduTranslator.cache) {
        baiduTranslator.cache.clear();
        cacheCleared = true;
      }
      
      // 清空腾讯翻译缓存
      if (tencentTranslator.cache) {
        tencentTranslator.cache.clear();
        cacheCleared = true;
      }
      
      if (cacheCleared) {
        vscode.window.showInformationMessage("所有翻译缓存已清空");
      } else {
        vscode.window.showWarningMessage("缓存未初始化");
      }
    }
  );

  /**
   * 注册翻译命令
   * 该命令获取用户选中的文本，让用户选择翻译API，然后进行翻译，并显示结果
   */
  const translateDisposable = vscode.commands.registerCommand(
    "uli-translation.translate",
    async () => {
      try {
        // 检查是否有可用的翻译API配置
        const baiduValid = baiduTranslator.isConfigValid();
        const tencentValid = tencentTranslator.isConfigValid();
        
        if (!baiduValid && !tencentValid) {
          // 两种API配置都无效，提示用户进行设置
          const message = "翻译API配置无效，请先配置百度翻译API或腾讯云机器翻译API";
          const result = await vscode.window.showWarningMessage(
            message,
            "配置百度翻译",
            "配置腾讯翻译",
            "取消"
          );
          
          // 根据用户选择打开相应的设置页面
          if (result === "配置百度翻译") {
            await vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "uliTranslation.baidu"
            );
          } else if (result === "配置腾讯翻译") {
            await vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "uliTranslation.tencent"
            );
          }
          return;
        }
        
        // 确定要使用的翻译器
        let translator: BaiduTranslator | TencentTranslator;
        let apiType: 'baidu' | 'tencent';
        
        // 从配置中获取默认翻译器设置
        const config = vscode.workspace.getConfiguration('uliTranslation');
        const defaultTranslator = config.get<'baidu' | 'tencent'>('defaultTranslator', 'baidu');
        
        // 根据默认设置和可用性确定要使用的翻译器
        if (defaultTranslator === 'baidu' && baiduValid) {
          // 用户默认选择百度翻译且配置有效
          apiType = 'baidu';
          translator = baiduTranslator;
        } else if (defaultTranslator === 'tencent' && tencentValid) {
          // 用户默认选择腾讯云翻译且配置有效
          apiType = 'tencent';
          translator = tencentTranslator;
        } else if (baiduValid) {
          // 默认选择的翻译器配置无效，但百度翻译配置有效
          apiType = 'baidu';
          translator = baiduTranslator;
        } else {
          // 默认选择的翻译器配置无效，使用腾讯云翻译（此时腾讯云翻译配置必定有效）
          apiType = 'tencent';
          translator = tencentTranslator;
        }

        // 获取当前活动的编辑器
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showInformationMessage("没有打开的编辑器");
          return;
        }

        // 获取用户选中的文本
        const selection = editor.selection;
        const text = editor.document.getText(selection);
        
        // 检查是否有选中的文本
        if (!text) {
          vscode.window.showInformationMessage("请先选择要翻译的文本");
          return;
        }

        // 在状态栏显示翻译进行中的提示
        const apiName = apiType === 'baidu' ? '百度' : '腾讯云';
        const statusBarMessage = vscode.window.setStatusBarMessage(`正在使用${apiName}翻译为英文...`);

        try {
          // 调用选定的翻译API进行翻译（自动检测语言到英文）
          const result = await translator.translate(text, 'auto', 'en');
          
          // 清除状态栏消息
          statusBarMessage.dispose();
          
          // 使用QuickPick显示翻译结果和选项
          // 导入格式化函数
          const { 
            toCamelCase, 
            toPascalCase, 
            toSnakeCase, 
            toKebabCase, 
            toUpperKebabCase, 
            toLowerWords, 
            toTitleWords, 
            toConstantCase 
          } = require('./utils');
          
          /* 创建格式化选项列表 */
          const items = [
            {
              label: '驼峰格式(小) camelCase',
              description: `${toCamelCase(result)}`,
              format: toCamelCase,
              action: 'format'
            },
            {
              label: '驼峰格式(大) PascalCase',
              description: `${toPascalCase(result)}`,
              format: toPascalCase,
              action: 'format'
            },
            {
              label: '下划线格式 snake_case',
              description: `${toSnakeCase(result)}`,
              format: toSnakeCase,
              action: 'format'
            },
            {
              label: '中划线格式(小) kebab-case',
              description: `${toKebabCase(result)}`,
              format: toKebabCase,
              action: 'format'
            },
            {
              label: '中划线格式(大) Kebab-Case',
              description: `${toUpperKebabCase(result)}`,
              format: toUpperKebabCase,
              action: 'format'
            },
            {
              label: '分词格式(小) lower words',
              description: `${toLowerWords(result)}`,
              format: toLowerWords,
              action: 'format'
            },
            {
              label: '分词格式(大) Title Words',
              description: `${toTitleWords(result)}`,
              format: toTitleWords,
              action: 'format'
            },
            {
              label: '常量格式 CONSTANT_CASE',
              description: `${toConstantCase(result)}`,
              format: toConstantCase,
              action: 'format'
            },
            {
              label: '查看详情',
              description: '查看完整的原文和译文',
              format: (text: string) => text,
              action: 'detail'
            }
          ];
          
          // 为每种格式添加替换选项
          const replaceItems = items
            .filter(item => item.action === 'format')
            .map(item => ({
              label: `替换为${item.label}`,
              description: `将选中文本「${text}」替换为: ${item.description}`,
              format: item.format,
              action: 'replace'
            }));
          
          // 创建复制到剪贴板选项
          const copyItem = {
            label: '复制结果',
            description: '将翻译结果复制到剪贴板',
            format: (text: string) => text,
            action: 'copy'
          };
          
          // 合并选项列表，确保复制选项在最后
          const allItems = [ ...replaceItems, copyItem];
          
          // 保存当前编辑器的选择区域，以便在QuickPick回调中使用
          const currentSelection = editor.selection;
          
          // 显示翻译结果和选项
          vscode.window.showQuickPick(allItems, {
            placeHolder: `译文: ${result.length > 50 ? result.substring(0, 50) + '...' : result}`,
            title: '选择翻译格式',
            matchOnDescription: true
          }).then(selectedItem => {
            if (selectedItem) {
              // 应用格式化
              const formattedText = selectedItem.format(result);
              
              // 将格式化后的结果缓存
              if (translator.cache && selectedItem.action !== 'detail' && selectedItem.action !== 'copy') {
                const cacheKey = `${text}|${selectedItem.label}`;
                translator.cache.set(cacheKey, formattedText, 'auto', 'en');
              }
              
              // 根据不同的操作类型执行相应的动作
              switch (selectedItem.action) {
                case 'copy':
                  // 将原始翻译结果复制到剪贴板
                  vscode.env.clipboard.writeText(result).then(() => {
                    vscode.window.showInformationMessage('翻译结果已复制到剪贴板');
                  });
                  break;
                  
                case 'detail':
                  // 显示详细结果
                  vscode.window.showInformationMessage(
                    `原文：${text}\n\n译文：${result}`,
                    { modal: true }
                  );
                  break;
                  
                case 'format':
                  // 复制格式化后的结果到剪贴板
                  vscode.env.clipboard.writeText(formattedText).then(() => {
                    vscode.window.showInformationMessage(`已复制${selectedItem.label}结果到剪贴板`);
                  });
                  break;
                  
                case 'replace':
                  // 替换编辑器中选中的文本
                  if (editor && !currentSelection.isEmpty) {
                    editor.edit(editBuilder => {
                      editBuilder.replace(currentSelection, formattedText);
                    }).then(success => {
                      if (success) {
                        vscode.window.showInformationMessage(`已将选中文本替换为${selectedItem.label.replace('替换为', '')}`);
                      } else {
                        vscode.window.showErrorMessage('替换文本失败');
                      }
                    });
                  } else {
                    vscode.window.showErrorMessage('无法替换文本，请确保有选中的文本');
                  }
                  break;
              }
            }
          });
          
          
        } finally {
          // 确保状态栏消息被清除
          statusBarMessage.dispose();
        }
      } catch (error) {
        // 处理翻译过程中的错误
        if (error instanceof Error) {
          // 显示具体的错误信息
          vscode.window.showErrorMessage(`翻译失败: ${error.message}`);
          console.error('翻译错误:', error);
        } else {
          // 显示通用错误信息
          vscode.window.showErrorMessage("翻译失败，请检查网络连接和API配置");
          console.error('未知翻译错误:', error);
        }
      }
    }
  );

  // 将命令添加到订阅列表中，确保插件停用时正确清理资源
  context.subscriptions.push(translateDisposable);
  context.subscriptions.push(showCacheMetricsDisposable);
  context.subscriptions.push(clearCacheDisposable);
  
  // 输出插件已准备就绪的消息
  console.log('uli-translation插件已准备就绪，可以使用Ctrl+T/Cmd+T快捷键将选中文本翻译为英文');
}

/**
 * 插件停用函数
 * 当插件被停用时调用此函数，用于清理资源
 */
export function deactivate() {
  // 目前没有需要清理的资源
  console.log('uli-translation插件已停用');
}

/**
 * 检查翻译API配置并提示用户进行设置
 * 
 * 该函数在以下情况下被调用：
 * 1. 插件首次激活时
 * 2. 用户修改了翻译API相关配置后
 * 
 * @param translator 翻译器实例，用于检查配置有效性
 * @param apiType 翻译API类型，'baidu'或'tencent'
 * @param isInitialCheck 是否是初始检查，默认为true
 * @returns Promise<boolean> 配置是否有效
 */
async function checkAndPromptForConfiguration(translator: BaiduTranslator | TencentTranslator, apiType: 'baidu' | 'tencent', isInitialCheck: boolean = true): Promise<boolean> {
  try {
    // 检查配置是否有效
    if (!translator.isConfigValid()) {
      // 根据API类型和是否是初始检查选择不同的提示消息
      let message = '';
      if (apiType === 'baidu') {
        message = isInitialCheck
          ? "欢迎使用uli-translation插件！请先配置百度翻译API的APPID和密钥。"
          : "百度翻译API配置无效，请设置APPID和密钥。";
      } else {
        message = isInitialCheck
          ? "欢迎使用uli-translation插件！请先配置腾讯云机器翻译API的SecretId和SecretKey。"
          : "腾讯云机器翻译API配置无效，请设置SecretId和SecretKey。";
      }
      
      // 显示警告消息，并提供操作按钮
      const result = await vscode.window.showWarningMessage(
        message,
        "前往设置",
        "稍后再说"
      );
      
      // 如果用户选择前往设置，则打开设置页面并聚焦到相应的翻译API配置项
      if (result === "前往设置") {
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          `uliTranslation.${apiType}`
        );
      }
      return false;
    } else if (isInitialCheck) {
      // 配置有效且是初次检查，显示成功消息
      const apiName = apiType === 'baidu' ? '百度翻译API' : '腾讯云机器翻译API';
      vscode.window.showInformationMessage(`${apiName}配置有效，可以开始使用翻译功能了！`);
      return true;
    }
    return true;
  } catch (error) {
    // 处理检查配置过程中可能出现的错误
    console.error(`检查${apiType === 'baidu' ? '百度' : '腾讯'}翻译API配置时出错:`, error);
    vscode.window.showErrorMessage(`检查${apiType === 'baidu' ? '百度' : '腾讯'}翻译API配置时出错，请重新启动VSCode后再试`);
    return false;
  }
}

/**
 * 检查快捷键是否与其他扩展冲突
 * 
 * 该函数检查插件设置的快捷键是否与其他扩展的快捷键冲突
 * 如果发现冲突，会通知用户并提供解决方案
 * 
 * @returns Promise<void>
 */
async function checkKeybindingConflicts(): Promise<void> {
  try {
    // 获取当前操作系统类型
    const isMac = process.platform === 'darwin';
    
    // 从package.json中获取我们的快捷键
    // 注意：这里使用硬编码的方式获取快捷键，因为VSCode API没有提供获取快捷键的公开方法
    // 如果快捷键在package.json中更改，这里也需要更新
    const ourKeybinding = isMac ? 'ctrl+cmd+t' : 'ctrl+t';
    const ourWhenClause = 'editorTextFocus';
    
    // 获取所有可用的命令
    const allCommands = await vscode.commands.getCommands();
    
    // 获取常见的可能冲突的命令
    // 这些是已知可能使用相同快捷键的命令
    const potentialConflictCommands = allCommands.filter(cmd => {
      // 排除我们自己的命令
      if (cmd === 'uli-translation.translate') {
        return false;
      }
      
      // 检查常见的可能冲突的命令模式
      // 例如，许多编辑器使用Ctrl+T/Cmd+T打开文件、切换标签等
      return (
        cmd.includes('newTab') ||
        cmd.includes('openFile') ||
        cmd.includes('search') ||
        cmd.includes('find') ||
        cmd.includes('navigate') ||
        cmd.includes('tab') ||
        cmd.includes('editor.action.transpose') // 这是VSCode内置的使用Ctrl+T的命令
      );
    });
    
    // 如果找到潜在冲突命令，显示警告
    if (potentialConflictCommands.length > 0) {
      // 构建冲突命令的列表
      const conflictCommandsList = potentialConflictCommands.join('\n- ');
      
      // 显示警告消息
      const message = `检测到可能的快捷键冲突！\n\n当前设置的快捷键 ${ourKeybinding} 可能与以下命令冲突：\n- ${conflictCommandsList}\n\n这可能导致翻译功能无法正常使用。`;
      
      const result = await vscode.window.showWarningMessage(
        '检测到可能的快捷键冲突，可能影响翻译功能使用',
        '查看详情',
        '修改快捷键',
        '忽略'
      );
      
      if (result === '查看详情') {
        // 显示详细信息
        const detailsPanel = vscode.window.createOutputChannel('uli-translation 快捷键冲突');
        detailsPanel.appendLine(message);
        detailsPanel.appendLine('\n您可以通过以下方式解决冲突：');
        detailsPanel.appendLine('1. 修改本插件的快捷键');
        detailsPanel.appendLine('2. 修改冲突命令的快捷键');
        detailsPanel.appendLine('3. 禁用冲突命令的快捷键');
        detailsPanel.appendLine('\n注意：此检测基于常见命令模式，可能存在误报或漏报。');
        detailsPanel.show();
      } else if (result === '修改快捷键') {
        // 打开键盘快捷键设置页面
        await vscode.commands.executeCommand(
          'workbench.action.openGlobalKeybindings',
          'uli-translation.translate'
        );
      }
    } else {
      console.log('未检测到明显的快捷键冲突');
      
      // 提示用户如何手动检查冲突
      vscode.window.showInformationMessage(
        '未检测到明显的快捷键冲突。如果翻译功能无法通过快捷键触发，请检查键盘快捷键设置。',
        '查看快捷键设置'
      ).then(result => {
        if (result === '查看快捷键设置') {
          vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', 'uli-translation.translate');
        }
      });
    }
  } catch (error) {
    console.error('检查快捷键冲突时出错:', error);
  }
}
