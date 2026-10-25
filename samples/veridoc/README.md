# VeriDoc sample data

Everything here is **synthetic**: made-up people, a made-up shop, made-up
amounts. No real names, phone numbers, addresses or payment details. Do not
add any.

- `chats/supply-order.txt`, `chats/freelance-job.txt`: two chats in the
  WhatsApp export line format (`DD/MM/YYYY, HH:MM - Name: message`),
  English with some Hinglish.
- `expected/*.json`: the terms a careful reader finds, with the 1-based chat
  lines each comes from. This is the reference the recorded model output is
  checked against.
- `order-confirmation.pdf`: a one-page text PDF (not a scan), made by
  `make_sample_pdf.py` (standard library only; rerun it to regenerate).
