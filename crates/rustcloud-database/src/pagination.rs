//! 分页类型与工具

use serde::{Deserialize, Serialize};

/// 分页结果容器
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Page<T> {
    /// 当前页数据项
    pub items: Vec<T>,
    /// 总数据项数量
    pub total: u64,
    /// 当前页码（从 1 开始）
    pub page: u32,
    /// 每页数据项数量
    pub page_size: u32,
    /// 总页数
    pub total_pages: u32,
    /// 是否有下一页
    pub has_next: bool,
    /// 是否有上一页
    pub has_prev: bool,
}

impl<T> Page<T> {
    /// 使用数据项和元数据创建分页结果
    pub fn new(items: Vec<T>, total: u64, page: u32, page_size: u32) -> Self {
        let total_pages = if page_size == 0 {
            0
        } else {
            ((total as f64) / (page_size as f64)).ceil() as u32
        };
        Self {
            items,
            total,
            page,
            page_size,
            total_pages,
            has_next: page < total_pages,
            has_prev: page > 1,
        }
    }

    /// 创建空分页结果
    pub fn empty(page: u32, page_size: u32) -> Self {
        Self {
            items: Vec::new(),
            total: 0,
            page,
            page_size,
            total_pages: 0,
            has_next: false,
            has_prev: false,
        }
    }

    /// 使用映射函数转换分页数据项
    pub fn map<U, F>(self, f: F) -> Page<U>
    where
        F: FnMut(T) -> U,
    {
        Page {
            items: self.items.into_iter().map(f).collect(),
            total: self.total,
            page: self.page,
            page_size: self.page_size,
            total_pages: self.total_pages,
            has_next: self.has_next,
            has_prev: self.has_prev,
        }
    }

    /// 检查该页是否为空
    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    /// 获取该页数据项数量
    pub fn len(&self) -> usize {
        self.items.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_page_new() {
        let items = vec![1, 2, 3];
        let page = Page::new(items, 10, 1, 3);

        assert_eq!(page.items.len(), 3);
        assert_eq!(page.total, 10);
        assert_eq!(page.page, 1);
        assert_eq!(page.page_size, 3);
        assert_eq!(page.total_pages, 4);
        assert!(page.has_next);
        assert!(!page.has_prev);
    }

    #[test]
    fn test_page_last() {
        let items = vec![10];
        let page = Page::new(items, 10, 4, 3);

        assert_eq!(page.total_pages, 4);
        assert!(!page.has_next);
        assert!(page.has_prev);
    }

    #[test]
    fn test_page_empty() {
        let page: Page<i32> = Page::empty(1, 10);

        assert!(page.is_empty());
        assert_eq!(page.total, 0);
        assert_eq!(page.total_pages, 0);
        assert!(!page.has_next);
        assert!(!page.has_prev);
    }

    #[test]
    fn test_page_map() {
        let items = vec![1, 2, 3];
        let page = Page::new(items, 3, 1, 10);
        let mapped = page.map(|x| x * 2);

        assert_eq!(mapped.items, vec![2, 4, 6]);
        assert_eq!(mapped.total, 3);
    }
}
