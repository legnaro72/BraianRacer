from pathlib import Path
import shutil

from PIL import Image
from reportlab.lib.colors import HexColor, black
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[2]
SCREENS = ROOT / "docs" / "manuale" / "screens"
OUT = ROOT / "output" / "pdf" / "Manuale_utente_Brain_Racer.pdf"
STATIC_OUT = ROOT / "static" / "manuale-brain-racer.pdf"
W, H = A4
M = 42
INK = HexColor("#3A2B36")
PINK = HexColor("#C84C78")
PALE = HexColor("#FFF4EE")
MUTED = HexColor("#765F6F")

pdfmetrics.registerFont(TTFont("Manual", r"C:\Windows\Fonts\segoeui.ttf"))
pdfmetrics.registerFont(TTFont("ManualBold", r"C:\Windows\Fonts\segoeuib.ttf"))


def text(c, value, x, y, size=10, font="Manual", color=INK):
    c.setFont(font, size)
    c.setFillColor(color)
    c.drawString(x, y, value)


def centered(c, value, y, size=10, font="Manual", color=INK):
    c.setFont(font, size)
    c.setFillColor(color)
    c.drawCentredString(W / 2, y, value)


def wrap_lines(value, font, size, max_width):
    words, lines, line = value.split(), [], ""
    for word in words:
        trial = f"{line} {word}".strip()
        if pdfmetrics.stringWidth(trial, font, size) <= max_width:
            line = trial
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def paragraph(c, value, x, y, width, size=10, leading=14, font="Manual", color=INK):
    c.setFont(font, size)
    c.setFillColor(color)
    for line in wrap_lines(value, font, size, width):
        c.drawString(x, y, line)
        y -= leading
    return y


def bullet(c, value, x, y, width, size=9.5, leading=13):
    text(c, "•", x, y, size=12, font="ManualBold", color=PINK)
    return paragraph(c, value, x + 14, y, width - 14, size=size, leading=leading)


def title(c, value, subtitle=None):
    text(c, value, M, H - M, size=22, font="ManualBold", color=black)
    if subtitle:
        text(c, subtitle, M, H - M - 24, size=10, color=MUTED)


def image_fit(c, path, x, y, max_w, max_h):
    with Image.open(path) as im:
        iw, ih = im.size
    scale = min(max_w / iw, max_h / ih)
    w, h = iw * scale, ih * scale
    c.drawImage(str(path), x + (max_w - w) / 2, y + (max_h - h) / 2,
                width=w, height=h, preserveAspectRatio=True, mask="auto")
    return w, h


def footer(c, page):
    centered(c, f"Brain Racer  Manuale utente  {page}", 22, size=8, color=MUTED)


def screenshot_box(c, path, x, y, w, h, caption):
    c.setFillColor(PALE)
    c.roundRect(x, y, w, h, 12, fill=1, stroke=0)
    image_fit(c, path, x + 8, y + 25, w - 16, h - 34)
    c.setFont("Manual", 7.8)
    c.setFillColor(MUTED)
    c.drawCentredString(x + w / 2, y + 9, caption)


OUT.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(OUT), pagesize=A4)
c.setTitle("Manuale utente Brain Racer")

# Page 1
centered(c, "Manuale utente Brain Racer", H - 70, size=25, font="ManualBold", color=black)
centered(c, "Irene e Daniele  12 settembre 2026", H - 101, size=13, font="ManualBold", color=PINK)
centered(c, "Guida rapida per giocare, lasciare una dedica", H - 127, size=10, color=INK)
centered(c, "e condividere le foto della festa", H - 143, size=10, color=INK)
image_fit(c, ROOT / "static" / "couple-cartoon.png", 95, 88, W - 190, H - 265)
centered(c, "irenedaniele.streamlit.app", 52, size=10, font="ManualBold", color=PINK)
footer(c, 1)
c.showPage()

# Page 2
title(c, "Iniziare a giocare", "Apri la web app dal telefono, dal tablet o dal computer. Non devi installare nulla.")
y = H - 100
for item in (
    "Scrivi un nickname di 3-16 caratteri e premi Gioca.",
    "Nel Garage trovi, in ordine: Condividi le foto della festa, Gioca e Area Sposi.",
    "Usa Sinistra e Destra per sterzare. Tieni premuto Accelera per aumentare la velocità.",
    "Sul touchscreen premi la pista per lanciare il bouquet contro i palloncini a cuore.",
    "Al traguardo rispondi alle tre domande. Verde significa risposta corretta, rosso risposta errata.",
    "Dopo Game Over premi Gioca ancora per ripartire.",
):
    y = bullet(c, item, M, y, W - 2 * M, size=9.2, leading=12) - 3
box_y, box_h, gap = 48, 470, 12
box_w = (W - 2 * M - gap) / 2
screenshot_box(c, SCREENS / "01-home.png", M, box_y, box_w, box_h, "Nickname e pulsante Gioca")
screenshot_box(c, SCREENS / "04-gioco.png", M + box_w + gap, box_y, box_w, box_h, "Pista e comandi touchscreen")
footer(c, 2)
c.showPage()

# Page 3
title(c, "Lasciare una dedica", "Il messaggio entra nel libro degli ospiti ed è visibile agli altri giocatori.")
shot_x, shot_y, shot_w, shot_h = M, 65, 245, 680
screenshot_box(c, SCREENS / "02-dediche.png", shot_x, shot_y, shot_w, shot_h, "Pagina Dediche su smartphone")
x, y, width = 315, H - 110, W - 315 - M
text(c, "Come fare", x, y, size=14, font="ManualBold", color=black)
y -= 28
for item in (
    "Dal menu scegli Dediche ♥.",
    "Scrivi il tuo messaggio per Irene e Daniele.",
    "Puoi usare fino a 800 caratteri.",
    "Premi Salva la dedica.",
    "Il messaggio appare con il tuo nickname.",
    "Puoi tornare e modificarlo.",
):
    y = bullet(c, item, x, y, width, size=9.5, leading=14) - 9
footer(c, 3)
c.showPage()

# Page 4
title(c, "Foto e Flipbook", "Gli invitati condividono gli scatti; Irene e Daniele scelgono quelli del Flipbook.")
shot_x, shot_y, shot_w, shot_h = M, 75, 245, 665
screenshot_box(c, SCREENS / "03-foto-upload.jpg", shot_x, shot_y, shot_w, shot_h, "Area aggiornata per scegliere e caricare le foto")
x, y, width = 315, H - 105, W - 315 - M
text(c, "Caricare le foto", x, y, size=13, font="ManualBold", color=black)
y -= 25
for item in (
    "Dal Garage premi Carica le tue foto: arrivi direttamente al selettore.",
    "Premi Scegli le foto e scegli fino a 20 scatti dalla galleria del telefono.",
    "Puoi caricare JPG, PNG, WebP, HEIC e HEIF, massimo 20 MB ciascuna.",
    "Premi Carica le foto e attendi la conferma.",
    "Premi Mostra tutte le foto della festa per aprire la galleria.",
    "Su Drive: MMDDYY_nickname_nomeoriginale.",
):
    y = bullet(c, item, x, y, width, size=8.8, leading=12) - 6
text(c, "Sfogliare il Flipbook", x, y - 2, size=13, font="ManualBold", color=black)
y -= 29
y = paragraph(c, "Il pulsante ♥ Apri il Flipbook si attiva quando gli sposi pubblicano almeno una foto. Usa Precedente e Successiva.", x, y, width, size=8.8, leading=12)
y -= 15
text(c, "Area riservata sposi", x, y, size=13, font="ManualBold", color=black)
y -= 24
for item in (
    "Apri il pulsante dorato Area Sposi e inserisci la password.",
    "Seleziona più foto o usa Seleziona tutte.",
    "Pubblica nel Flipbook o Rimuovi dal Flipbook.",
    "Assegna una posizione per scambiare due foto; usa anche le frecce.",
    "Nella preselezione la Vista a griglia mostra tre miniature per riga anche sul telefono.",
    "La vista compatta a griglia facilita l’ordinamento di molte foto.",
    "Quando l’ordine è definitivo premi Blocca.",
    "Usa Sblocca per rendere di nuovo modificabile la posizione.",
    "Elimina selezionate richiede conferma.",
    "Annulla selezione deseleziona tutto.",
):
    y = bullet(c, item, x, y, width, size=8.7, leading=12) - 5
text(c, "Se qualcosa non risponde", x, y - 1, size=12, font="ManualBold", color=black)
y -= 25
paragraph(c, "Controlla la connessione, attendi qualche secondo e riprova. Per molte foto usa gruppi più piccoli. Dopo un aggiornamento ricarica completamente la pagina.", x, y, width, size=8.5, leading=12)
footer(c, 4)
c.save()
shutil.copy2(OUT, STATIC_OUT)
print(OUT)
