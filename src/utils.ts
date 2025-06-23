/**
 * VSCode翻译插件 - 工具函数
 * 
 * 该文件包含插件使用的各种工具函数，包括文本格式化、HTML转义等
 * 
 * @author uli
 * @version 1.1.0
 */

/**
 * 转义HTML特殊字符，防止XSS攻击
 * 
 * 该函数将HTML中的特殊字符转换为对应的HTML实体，以防止在Webview中插入恶意代码
 * 转义的字符包括：& < > " '
 * 
 * @param text 需要转义的文本字符串
 * @returns 转义后的安全文本字符串
 * @example
 * // 返回: "&lt;script&gt;alert('XSS');&lt;/script&gt;"
 * escapeHtml("<script>alert('XSS');</script>");
 */
export function escapeHtml(text: string): string {
  if (!text) {
    return '';
  }
  
  return text
    .replace(/&/g, '&amp;')   // 必须首先替换&字符
    .replace(/</g, '&lt;')    // 替换小于号
    .replace(/>/g, '&gt;')    // 替换大于号
    .replace(/"/g, '&quot;') // 替换双引号
    .replace(/'/g, '&#039;'); // 替换单引号
}

/**
 * 将文本转换为小驼峰格式
 * 例如："hello world" -> "helloWorld"
 * 
 * @param text 需要转换的文本
 * @returns 小驼峰格式的文本
 */
export function toCamelCase(text: string): string {
  if (!text) {
    return '';
  }
  
  // 先将文本按空格、连字符、下划线等分割成单词
  return text
    .replace(/[\s-_]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/[\s-_]+/g, '')
    .replace(/^[A-Z]/, c => c.toLowerCase());
}

/**
 * 将文本转换为大驼峰格式（帕斯卡命名法）
 * 例如："hello world" -> "HelloWorld"
 * 
 * @param text 需要转换的文本
 * @returns 大驼峰格式的文本
 */
export function toPascalCase(text: string): string {
  if (!text) {
    return '';
  }
  
  // 先转换为小驼峰，然后将首字母大写
  return toCamelCase(text).replace(/^[a-z]/, c => c.toUpperCase());
}

/**
 * 将文本转换为下划线格式
 * 例如："hello world" -> "hello_world"
 * 
 * @param text 需要转换的文本
 * @returns 下划线格式的文本
 */
export function toSnakeCase(text: string): string {
  if (!text) {
    return '';
  }
  
  return text
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/_+/g, '_');
}

/**
 * 将文本转换为小写中划线格式
 * 例如："hello world" -> "hello-world"
 * 
 * @param text 需要转换的文本
 * @returns 小写中划线格式的文本
 */
export function toKebabCase(text: string): string {
  if (!text) {
    return '';
  }
  
  return text
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '')
    .replace(/-+/g, '-');
}

/**
 * 将文本转换为首字母大写中划线格式
 * 例如："hello world" -> "Hello-World"
 * 
 * @param text 需要转换的文本
 * @returns 首字母大写中划线格式的文本
 */
export function toUpperKebabCase(text: string): string {
  if (!text) {
    return '';
  }
  
  // 先转换为小写中划线格式
  const kebabText = toKebabCase(text);
  
  // 将每个单词的首字母大写
  return kebabText.split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('-');
}

/**
 * 将文本转换为小写分词格式
 * 例如："hello world" -> "hello world"
 * 
 * @param text 需要转换的文本
 * @returns 小写分词格式的文本
 */
export function toLowerWords(text: string): string {
  if (!text) {
    return '';
  }
  
  return text
    .replace(/([A-Z])/g, ' $1')
    .replace(/[\s-_]+/g, ' ')
    .toLowerCase()
    .trim();
}

/**
 * 将文本转换为首字母大写分词格式
 * 例如："hello world" -> "Hello World"
 * 
 * @param text 需要转换的文本
 * @returns 首字母大写分词格式的文本
 */
export function toTitleWords(text: string): string {
  if (!text) {
    return '';
  }
  
  return toLowerWords(text)
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * 将文本转换为常量格式（全大写下划线）
 * 例如："hello world" -> "HELLO_WORLD"
 * 
 * @param text 需要转换的文本
 * @returns 常量格式的文本
 */
export function toConstantCase(text: string): string {
  if (!text) {
    return '';
  }
  
  return toSnakeCase(text).toUpperCase();
}