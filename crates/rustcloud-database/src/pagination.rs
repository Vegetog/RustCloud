//! Pagination types and utilities

use serde::{Deserialize, Serialize};

/// Paginated result container
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Page<T> {
    /// Items in current page
    pub items: Vec<T>,
    /// Total number of items
    pub total: u64,
    /// Current page number (1-indexed)
    pub page: u32,
    /// Items per page
    pub page_size: u32,
    /// Total number of pages
    pub total_pages: u32,
    /// Has more pages
    pub has_next: bool,
    /// Has previous pages
    pub has_prev: bool,
}

impl<T> Page<T> {
    /// Create a new page with items and metadata
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

    /// Create an empty page
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

    /// Transform page items using a mapping function
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

    /// Check if the page is empty
    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    /// Get the number of items in this page
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
