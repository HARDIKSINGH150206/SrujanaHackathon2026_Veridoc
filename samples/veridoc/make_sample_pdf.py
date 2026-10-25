"""Writes order-confirmation.pdf: a one-page text PDF with made-up data.

Standard library only. Text is left uncompressed on purpose so the file is a
text PDF (not a scan) and so tests can read it.
"""

from pathlib import Path

LINES = [
    ("F1", 16, "Order Confirmation - SYNTHETIC SAMPLE"),
    ("F1", 10, "Made-up data for testing. Not a real order, shop or person."),
    ("F1", 12, ""),
    ("F1", 12, "Supplier: Lumo Stationers (fictional)"),
    ("F1", 12, "Buyer: Dev"),
    ("F1", 12, "Date: 12 March 2026"),
    ("F1", 12, ""),
    ("F1", 12, "Item: A5 ruled notebook, school logo on cover"),
    ("F1", 12, "Quantity: 200"),
    ("F1", 12, "Price per piece: Rs 45"),
    ("F1", 12, "Total: Rs 9000"),
    ("F1", 12, "Advance received: Rs 3000"),
    ("F1", 12, "Balance on delivery: Rs 6000"),
    ("F1", 12, "Delivery by: 20 March 2026"),
]


def build() -> bytes:
    ops, y = [], 780
    for font, size, text in LINES:
        if text:
            safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            ops.append(f"BT /{font} {size} Tf 56 {y} Td ({safe}) Tj ET")
        y -= size + 10
    stream = "\n".join(ops).encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ]
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


if __name__ == "__main__":
    target = Path(__file__).with_name("order-confirmation.pdf")
    target.write_bytes(build())
    print(f"wrote {target}")
