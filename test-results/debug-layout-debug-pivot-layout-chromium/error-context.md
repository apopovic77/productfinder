# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic:
    - generic:
      - generic [ref=e2]:
        - textbox "Search" [ref=e3]
        - combobox [ref=e4]:
          - option "All Categories" [selected]
        - combobox [ref=e5]:
          - option "All Seasons" [selected]
        - spinbutton [ref=e6]
        - spinbutton [ref=e7]
        - spinbutton [ref=e8]
        - spinbutton [ref=e9]
        - combobox [ref=e10]:
          - 'option "Sort: None" [selected]'
          - option "Name (A-Z)"
          - option "Name (Z-A)"
          - option "Price (Low-High)"
          - option "Price (High-Low)"
          - option "Weight (Light-Heavy)"
          - option "Weight (Heavy-Light)"
          - option "Season (Newest)"
        - button "Reset Filters" [ref=e11] [cursor=pointer]
        - button "Reset View" [ref=e12] [cursor=pointer]
        - button "❤️ Favorites OFF" [ref=e13] [cursor=pointer]
        - button "📚 Pivot" [ref=e14] [cursor=pointer]
        - combobox [ref=e15]:
          - option "By Category" [selected]
          - option "By Brand"
          - option "By Season"
          - option "By Price"
        - button "📊 Grid" [ref=e16] [cursor=pointer]
        - button "🧱 Masonry" [ref=e17] [cursor=pointer]
        - button "🔬 Compact" [ref=e18] [cursor=pointer]
        - button "🔭 Large" [ref=e19] [cursor=pointer]
      - button "🛠️" [ref=e21] [cursor=pointer]
```