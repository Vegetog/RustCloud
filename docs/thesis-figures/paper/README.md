# Paper-Optimized Figures

This folder contains larger-font thesis figures for Word insertion.

Differences from the original figures:

- Text size is increased through `mermaid-paper-config.json`.
- PNG export should use scale `4` to reduce raster blur after Word resizing.
- Complex diagrams are split into smaller figures so text remains readable after
  fitting within one page.

Recommended Word insertion:

- Use PNG when the final document must be stable across machines.
- Use SVG only when Word renders it clearly on the target machine.
- Disable Word image compression and choose the highest fidelity option.

Suggested replacement mapping:

| Original | Paper version |
| --- | --- |
| `fig-4-2-er-diagram` | `fig-4-2a-er-core-paper` and `fig-4-2b-er-sharing-paper` |
| `fig-4-3-key-hierarchy` | `fig-4-3a-user-key-chain-paper` and `fig-4-3b-file-key-chain-paper` |
| `fig-4-8-public-share-flow` | `fig-4-8a-public-share-create-paper` and `fig-4-8b-public-share-access-paper` |

For CLI export:

```bash
mmdc -i fig-4-1-system-architecture-paper.mmd -o fig-4-1-system-architecture-paper.png -c mermaid-paper-config.json -b white -s 4
```

