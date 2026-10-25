# Fonts

`NotoSans-Latin-Devanagari-subset.ttf` is used to draw the recap PDF (`src/lib/recap-pdf.ts`), so that English text, the rupee sign and Hindi text all render.

It is a subset of **Noto Sans** (Latin, punctuation, bullet, rupee sign) merged with a subset of **Noto Sans Devanagari** (U+0900 to U+097F and the joiners), both Copyright Google Inc. and licensed under the **SIL Open Font License 1.1** (https://openfontlicense.org). The merged file is a Modified Version under that license and is distributed under it, with no charge for the font itself.

Made with fontTools from the system fonts `NotoSans-Regular.ttf` and `NotoSansDevanagari-Regular.ttf`:

```
pyftsubset NotoSans-Regular.ttf --unicodes="U+0020-007E,U+00A0,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+20B9"
pyftsubset NotoSansDevanagari-Regular.ttf --unicodes="U+0900-097F,U+200C,U+200D,U+25CC" --layout-features='*'
python -m fontTools.merge latin.ttf deva.ttf
```
