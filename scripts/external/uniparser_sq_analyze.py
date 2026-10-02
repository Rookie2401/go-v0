# -*- coding: utf-8 -*-
"""
Bridge to the UniParser Albanian analyzer (PyPI package uniparser-albanian, MIT licence, (c) 2011-2025 Maria Morozova,
Alexander Rusakov, Timofey Arkhangelskiy). Reads written forms, one per line (UTF-8), from a file; writes one JSON
object per line: {"form": ..., "analyses": [{"lemma": ..., "gramm": ..., "trans_en": ...}, ...]}.
An unrecognised form has an empty list. Analyses are context-free (no CG3 disambiguation is used).

  data/private/venv-sq/Scripts/python.exe scripts/external/uniparser_sq_analyze.py <forms.txt> <out.jsonl> [strict|nodiacritics]

Used offline only: to check the course's own word list and rules, and to check course-written texts. Nothing produced
here is shipped with the application.
"""
import io
import json
import sys

from uniparser_albanian import AlbanianAnalyzer


def main():
    src, dst = sys.argv[1], sys.argv[2]
    mode = sys.argv[3] if len(sys.argv) > 3 else 'strict'
    analyzer = AlbanianAnalyzer(mode=mode)
    with io.open(src, 'r', encoding='utf-8') as f:
        forms = [line.rstrip('\n').rstrip('\r') for line in f if line.strip()]
    results = analyzer.analyze_words(forms)
    with io.open(dst, 'w', encoding='utf-8', newline='\n') as out:
        for form, analyses in zip(forms, results):
            rows = []
            seen = set()
            for a in analyses:
                if not a.lemma and not a.gramm:
                    continue
                trans = ''
                for key, value in (getattr(a, 'otherData', None) or []):
                    if key == 'trans_en':
                        trans = value
                key = (a.lemma, a.gramm)
                if key in seen:
                    continue
                seen.add(key)
                rows.append({'lemma': a.lemma, 'gramm': a.gramm, 'trans_en': trans})
            out.write(json.dumps({'form': form, 'analyses': rows}, ensure_ascii=False) + '\n')
    sys.stderr.write('analysed %d forms (%s)\n' % (len(forms), mode))


if __name__ == '__main__':
    main()
