"""Check browser-printed fixtures, then render every page for visual inspection.

Run make-print-fixtures.mjs, print those HTML files through the browser, then:
python tests/verify-printed-pdfs.py output/qa-v62/printed --poppler PATH_TO_PDFTOPPM
"""
from pathlib import Path
from collections import Counter
import argparse
import json
import re
import subprocess
import pdfplumber
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser()
parser.add_argument('directory', type=Path)
parser.add_argument('--poppler', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
fixtures = json.loads((root / 'tmp/print-review/manifest.json').read_text(encoding='utf-8'))
results = []
for fixture in fixtures:
    name = fixture['name']
    with pdfplumber.open(args.directory / (name + '.pdf')) as pdf:
        texts = [page.extract_text() or '' for page in pdf.pages]
        full = '\n'.join(texts)
        expected = Counter(fixture['markers'])
        actual = Counter(re.findall(r'\b(?:NOTE|CAPTION|OFFICE|KEY|GENERAL|INSTRUCTION)\d{3}\b', full))
        assert not expected - actual, f'{name}: missing recorded text: {expected - actual}'
        for n, page in enumerate(pdf.pages, 1):
            assert abs(page.width - 612) < 1 and abs(page.height - 792) < 1, f'{name}: unexpected paper size'
            assert f'Page {n} of {len(pdf.pages)}' in texts[n-1], f'{name}: missing page number'
            body = [c for c in page.chars if c['text'].strip() and c['top'] < 744]
            assert len(body) > 35, f'{name} page {n}: nearly empty page'
            for char in page.chars:
                if not char['text'].strip():
                    continue
                assert char['x0'] >= 38 and char['x1'] <= page.width-38, f'{name} page {n}: horizontal overflow'
                assert char['top'] >= 38 and char['bottom'] <= page.height-20, f'{name} page {n}: vertical overflow'
            # Photo appendix headings must share the page with photo content.
            if re.search(r'Photo evidence - \d+ photos?', texts[n-1]):
                assert re.search(r'Photo \d+ -', texts[n-1]), f'{name} page {n}: orphan photo heading'
            if name == 'long-notes' and 'Notes / photo references' in texts[n-1] and 'NOTE' in texts[n-1]:
                assert 'Kitchen' in texts[n-1], f'{name} page {n}: missing continued room name'
            if name in ('routine', 'out') and 'Estimated ' in texts[n-1]:
                assert 'Office review - responsibility and estimates' in texts[n-1], f'{name}: detached estimate total'
        results.append({'case':name, 'pages':len(pdf.pages), 'text_markers':sum(expected.values()), 'checks':'passed'})
    if args.poppler:
        render_dir = args.directory / name
        render_dir.mkdir(exist_ok=True)
        subprocess.run([str(args.poppler), '-r', '85', '-png', str(args.directory/(name+'.pdf')), str(render_dir/'page')], check=True, capture_output=True)
        pages = sorted(render_dir.glob('page-*.png'), key=lambda p:int(p.stem.split('-')[-1]))
        sheet = Image.new('RGB', (4*310, ((len(pages)+3)//4)*420), '#b5bec8')
        draw = ImageDraw.Draw(sheet)
        for i, page in enumerate(pages):
            image = Image.open(page).convert('RGB')
            image.thumbnail((298,385))
            x, y = (i%4)*310+6, (i//4)*420+22
            sheet.paste(image,(x,y))
            draw.text((x,y-17),f'{name} page {i+1}',fill='black')
        sheet.save(args.directory/(name+'-contact.png'))
    print(name, results[-1]['pages'], 'pages: passed')
(args.directory/'verification.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print('All printed text, margins, page numbers and photo headings passed.')

app_pdf = args.directory/'app-print.pdf'
if app_pdf.exists():
    with pdfplumber.open(app_pdf) as pdf:
        text = '\n'.join(page.extract_text() or '' for page in pdf.pages)
        for required in ['SAMPLE PROPERTY', 'Detailed checklist', 'Sample Inspector', 'Photo 7 -']:
            assert required in text, f'App print view missing {required}'
        for control in ['All rooms', 'Finish / PDF', 'Test mode', 'App print fixture ready']:
            assert control not in text, f'App controls leaked into print: {control}'
        for n, page in enumerate(pdf.pages,1):
            for char in page.chars:
                if char['text'].strip():
                    assert char['x0']>=38 and char['x1']<=page.width-38 and char['top']>=38 and char['bottom']<=page.height-20, f'App page {n}: text outside print margins'
        print('Actual app print handler:',len(pdf.pages),'pages, report content only, margins passed.')
