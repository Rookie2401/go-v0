# -*- coding: utf-8 -*-
"""
Probe: what does the UniParser Albanian analyzer return? Prints, for a few words and one sentence, every analysis
(lemma, grammatical tags, gloss, other data). Run with the isolated environment:
  data/private/venv-sq/Scripts/python.exe scripts/external/uniparser_sq_probe.py [word ...]
The analyzer is the PyPI package uniparser-albanian (MIT, Timofey Arkhangelskiy); nothing here is shipped with the app.
"""
import io
import sys
import time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from uniparser_albanian import AlbanianAnalyzer

t0 = time.time()
a = AlbanianAnalyzer(mode='strict')
print('loaded in %.1f s' % (time.time() - t0))

words = sys.argv[1:] or ['libër', 'libri', 'librin', 'librit', 'libra', 'librat', 'librave', 'vajza', 'punoj', 'punon', 'punova',
                         'punuar', 'është', 'jam', 'ma', 'ta', 'ia', "t'i", "m'u", "s'jam", "s'mora", 'e', 'i', 'të', 'së', 'mirë',
                         'mira', 'lahem', 'dha', 'blorfova', 'asht', 'nji']
t0 = time.time()
for w in words:
    analyses = a.analyze_words(w)
    print(w)
    for x in analyses:
        other = getattr(x, 'otherData', None)
        print('   lemma=%r gramm=%r gloss=%r wfGlossed=%r other=%r' % (x.lemma, x.gramm, getattr(x, 'gloss', ''), getattr(x, 'wfGlossed', ''), other))
print('%d words in %.2f s' % (len(words), time.time() - t0))

sentence = ['Unë', 'nuk', 'ia', 'dhashë', 'librin', 'vajzës', 'së', 'mirë', '.']
print('sentence (disambiguate=True):')
for w, analyses in zip(sentence, a.analyze_words(sentence, disambiguate=True)):
    print('  ', w, ' | '.join('%s [%s]' % (x.lemma, x.gramm) for x in analyses))
