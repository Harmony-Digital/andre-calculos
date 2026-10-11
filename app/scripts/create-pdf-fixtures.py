"""Somente documentos inventados para testar o visualizador, sem dados reais."""
from io import BytesIO
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DictionaryObject, NameObject, TextStringObject

root = Path(__file__).resolve().parents[1] / "tests" / "fixtures"
root.mkdir(parents=True, exist_ok=True)
buffer = BytesIO()
pdf = canvas.Canvas(buffer, pagesize=A4)
pdf.setTitle("Documento inteiramente fictício")
pdf.setAuthor("Fixtures do Portal de Cálculos")
for page in range(1, 3):
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(48, 790, "Documento inteiramente fictício")
    pdf.setFont("Helvetica", 12)
    pdf.drawString(48, 750, f"Página {page} de 2 - Teste do visualizador privado")
    pdf.drawString(48, 725, "Este arquivo não contém informações de pessoas ou processos reais.")
    if page == 1:
        pdf.drawString(48, 680, "Texto de teste com acentos: decisão, cálculo e página.")
        pdf.linkURL("https://pdf-fixture.example.invalid/?sentinela=pdf-link", (48, 670, 400, 700))
    pdf.showPage()
pdf.save()
writer = PdfWriter()
writer.clone_document_from_reader(PdfReader(buffer))
writer._root_object[NameObject("/OpenAction")] = DictionaryObject({NameObject("/S"): NameObject("/JavaScript"), NameObject("/JS"): TextStringObject("app.alert('pdf-script-sentinela');")})
with (root / "processo-ficticio.pdf").open("wb") as output:
    writer.write(output)
encrypted = PdfWriter()
encrypted.clone_document_from_reader(PdfReader(root / "processo-ficticio.pdf"))
encrypted.encrypt("senha-pdf-ficticia-para-testes", algorithm="AES-256")
with (root / "processo-ficticio-protegido.pdf").open("wb") as output:
    encrypted.write(output)
print("Duas fixtures fictícias de PDF, com duas páginas, preparadas.")
