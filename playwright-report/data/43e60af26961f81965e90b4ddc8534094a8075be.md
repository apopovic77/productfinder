# Page snapshot

```yaml
- generic [ref=e3]:
  - heading "Annotation Tester" [level=2] [ref=e4]
  - generic [ref=e5]:
    - generic [ref=e6]: Storage Object ID
    - textbox "Storage Object ID" [ref=e7]:
      - /placeholder: "12345"
      - text: "4642"
    - generic [ref=e8]: API Key
    - textbox "API Key" [ref=e9]:
      - /placeholder: X-API-Key
      - text: oneal_demo_token
    - generic [ref=e10]: "Using: default key from env or demo"
    - generic [ref=e11]: Vision Mode
    - combobox "Vision Mode" [ref=e12]:
      - option "auto"
      - option "product" [selected]
      - option "generic"
    - generic [ref=e13]: Context Role
    - combobox "Context Role" [ref=e14]:
      - option "product" [selected]
      - option "lifestyle"
      - option "doc"
      - option "other"
    - generic [ref=e15]: AI Metadata (JSON)
    - textbox "AI Metadata (JSON)" [ref=e16]:
      - /placeholder: "{\"brand\":\"O'Neal\",\"features\":[\"knee protector\",\"zipper\"]}"
  - generic [ref=e17]:
    - button "Load Image" [active] [ref=e18] [cursor=pointer]
    - button "Start Analysis" [ref=e19] [cursor=pointer]
    - button "Fetch Annotations" [ref=e20] [cursor=pointer]
  - img "preview" [ref=e23]
```