/**
 * 翻译缓存模块
 * 
 * 该模块提供翻译结果的缓存功能，减少重复翻译请求，提高响应速度
 * 缓存会在指定的过期时间后自动失效（默认为3天）
 * 
 * @author uli
 * @version 1.0.0
 */

import * as vscode from 'vscode';

/**
 * 缓存项接口
 * 定义缓存中存储的数据结构
 */
interface CacheItem {
  result: string;       // 翻译结果
  timestamp: number;    // 缓存创建时间戳
  from: string;         // 源语言
  to: string;           // 目标语言
}

/**
 * 翻译缓存类
 * 提供翻译结果的缓存管理功能
 */
export class TranslationCache {
  // 缓存数据，键为原文+源语言+目标语言的组合，值为缓存项
  private cache: Map<string, CacheItem>;
  // 缓存过期时间（毫秒），默认为3天
  private expirationTime: number;
  // 扩展上下文，用于持久化存储
  private context: vscode.ExtensionContext;
  // 缓存存储键
  private readonly CACHE_KEY = 'uliTranslation.cache';
  // 缓存大小限制（字节），默认为20MB以确保快速响应
  private maxCacheSize: number;
  // 当前缓存大小（字节）
  private currentCacheSize: number = 0;
  // 性能监控
  private metrics = {
    hits: 0,
    misses: 0,
    totalResponseTime: 0,
    responses: 0
  };
  // 上次保存缓存的时间戳
  private lastSaveTime: number = Date.now();

  /**
   * 构造函数
   * @param context 扩展上下文，用于持久化存储
   * @param expirationDays 缓存过期天数，默认为3天
   * @param maxCacheSizeMB 缓存大小限制（MB），默认为50MB
   */
  constructor(context: vscode.ExtensionContext, expirationDays: number = 3, maxCacheSizeMB: number = 20) {
    this.context = context;
    this.expirationTime = expirationDays * 24 * 60 * 60 * 1000; // 转换为毫秒
    this.maxCacheSize = maxCacheSizeMB * 1024 * 1024; // 转换为字节
    this.cache = new Map<string, CacheItem>();
    
    // 从存储中加载缓存
    this.loadCache();
    
    // 清理过期缓存
    this.cleanExpiredCache();
    
    console.log(`翻译缓存已初始化，过期时间: ${expirationDays}天，缓存大小限制: ${maxCacheSizeMB}MB`);
  }

  /**
   * 从存储中加载缓存
   */
  private loadCache(): void {
    try {
      const cachedData = this.context.globalState.get<{ [key: string]: CacheItem }>(this.CACHE_KEY);
      if (cachedData) {
        // 将对象转换为Map并计算缓存大小
        this.currentCacheSize = 0;
        Object.keys(cachedData).forEach(key => {
          this.cache.set(key, cachedData[key]);
          this.currentCacheSize += this.calculateItemSize(key, cachedData[key]);
        });
        console.log(`已加载${this.cache.size}条翻译缓存，当前缓存大小：${this.formatSize(this.currentCacheSize)}`);
      }
    } catch (error) {
      console.error('加载翻译缓存失败:', error);
      // 如果加载失败，使用空缓存
      this.cache = new Map<string, CacheItem>();
    }
  }

  /**
   * 将缓存保存到存储中
   */
  private saveCache(): void {
    const now = Date.now();
    // 限制保存频率，至少间隔1秒
    if (now - this.lastSaveTime < 1000) {
      return;
    }
    this.lastSaveTime = now;
    try {
      // 将Map转换为对象以便存储
      const cacheObject: { [key: string]: CacheItem } = {};
      this.cache.forEach((value, key) => {
        cacheObject[key] = value;
      });
      
      // 保存到扩展的全局状态
      this.context.globalState.update(this.CACHE_KEY, cacheObject);
    } catch (error) {
      console.error('保存翻译缓存失败:', error);
    }
  }

  /**
   * 清理过期的缓存项
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    let expiredCount = 0;
    
    // 遍历缓存，删除过期项
    this.cache.forEach((item, key) => {
      if (now - item.timestamp > this.expirationTime) {
        this.cache.delete(key);
        expiredCount++;
      }
    });
    
    if (expiredCount > 0) {
      console.log(`已清理${expiredCount}条过期翻译缓存`);
      // 保存更新后的缓存
      this.saveCache();
    }
  }

  /**
   * 生成缓存键
   * @param text 原文
   * @param from 源语言
   * @param to 目标语言
   * @returns 缓存键
   */
  private generateKey(text: string, from: string, to: string): string {
    return `${text}|${from}|${to}`;
  }

  /**
   * 获取缓存的翻译结果
   * @param text 原文
   * @param from 源语言
   * @param to 目标语言
   * @returns 缓存的翻译结果，如果没有缓存或缓存已过期则返回null
   */
  public get(text: string, from: string, to: string): string | null {
    const startTime = Date.now();
    const key = this.generateKey(text, from, to);
    const cachedItem = this.cache.get(key);
    
    // 如果没有缓存，返回null
    if (!cachedItem) {
      this.metrics.misses++;
      return null;
    }
    
    // 检查缓存是否过期
    const now = Date.now();
    if (now - cachedItem.timestamp > this.expirationTime) {
      // 缓存已过期，删除并返回null
      this.cache.delete(key);
      this.saveCache();
      return null;
    }
    
    // 更新性能指标
    this.metrics.hits++;
    this.metrics.totalResponseTime += Date.now() - startTime;
    this.metrics.responses++;
    
    // 返回缓存的翻译结果
    return cachedItem.result;
  }

  /**
   * 设置翻译结果缓存
   * @param text 原文
   * @param result 翻译结果
   * @param from 源语言
   * @param to 目标语言
   */
  /**
   * 计算缓存项的大小（字节）
   * @param key 缓存键
   * @param item 缓存项
   * @returns 缓存项大小（字节）
   */
  private calculateItemSize(key: string, item: CacheItem): number {
    // 计算字符串占用的字节数（假设使用UTF-16编码，每个字符2字节）
    const keySize = key.length * 2;
    const resultSize = item.result.length * 2;
    const fromSize = item.from.length * 2;
    const toSize = item.to.length * 2;
    // 时间戳为8字节（number类型）
    const timestampSize = 8;
    
    return keySize + resultSize + fromSize + toSize + timestampSize;
  }

  /**
   * 格式化大小显示
   * @param bytes 字节数
   * @returns 格式化后的大小字符串
   */
  private formatSize(bytes: number): string {
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
   * 检查并清理缓存大小
   * 当缓存大小超过限制时，按时间戳从旧到新删除缓存项
   */
  private checkAndCleanCacheSize(): void {
    if (this.currentCacheSize <= this.maxCacheSize) {
      return;
    }

    // 将缓存项转换为数组并按时间戳排序（从旧到新）
    const items = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.timestamp - b.timestamp);

    let cleanedCount = 0;
    // 从最旧的开始删除，直到缓存大小低于限制
    while (this.currentCacheSize > this.maxCacheSize && items.length > 0) {
      const [key, item] = items.shift()!;
      const itemSize = this.calculateItemSize(key, item);
      this.cache.delete(key);
      this.currentCacheSize -= itemSize;
      cleanedCount++;
    }

    if (cleanedCount > 0) {
      console.log(`缓存大小超出限制，已清理${cleanedCount}条最早的缓存项，当前缓存大小：${this.formatSize(this.currentCacheSize)}`);
      this.saveCache();
    }
  }

  public set(text: string, result: string, from: string, to: string): void {
    const key = this.generateKey(text, from, to);
    
    // 创建缓存项
    const cacheItem: CacheItem = {
      result,
      timestamp: Date.now(),
      from,
      to
    };
    
    // 如果是更新现有缓存项，先减去原有大小
    if (this.cache.has(key)) {
      const oldItem = this.cache.get(key)!;
      this.currentCacheSize -= this.calculateItemSize(key, oldItem);
    }
    
    // 计算新缓存项的大小
    const newItemSize = this.calculateItemSize(key, cacheItem);
    this.currentCacheSize += newItemSize;
    
    // 更新缓存
    this.cache.set(key, cacheItem);
    
    // 检查并清理超出大小限制的缓存
    this.checkAndCleanCacheSize();
    
    // 保存缓存
    this.saveCache();
  }

  /**
   * 清空所有缓存
   */
  /**
   * 获取缓存性能指标
   * @returns 性能指标对象
   */
  public getMetrics(): { hitRate: number; avgResponseTime: number; size: number } {
    const total = this.metrics.hits + this.metrics.misses;
    return {
      hitRate: total > 0 ? (this.metrics.hits / total) * 100 : 0,
      avgResponseTime: this.metrics.responses > 0 ? this.metrics.totalResponseTime / this.metrics.responses : 0,
      size: this.currentCacheSize
    };
  }

  public clear(): void {
    this.cache.clear();
    this.currentCacheSize = 0;
    this.saveCache();
    console.log('已清空所有翻译缓存');
  }

  /**
   * 获取缓存项数量
   * @returns 缓存项数量
   */
  public size(): number {
    return this.cache.size;
  }
}