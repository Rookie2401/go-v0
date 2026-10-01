#!/usr/bin/env python3
"""
Segment the benchmark sentences with PyThaiNLP's newmm engine and write the result in the editing format, so that
`npm run bench:words -- --external newmm=<file>` can score it next to the course adapter.

Not run by the repository: Python is not installed on the development machine and nothing is downloaded by the build.
Run it yourself where Python and PyThaiNLP are available:

    pip install pythainlp
    python scripts/external/pythainlp_tokenize.py --gold data/benchmarks/th/generated --out data/benchmarks/th/generated/external/newmm.edit.txt
    npm run bench:words -- --external newmm=data/benchmarks/th/generated/external/newmm.edit.txt

Other engines: --engine attacut | deepcut | ... (whatever your PyThaiNLP install provides); use a matching name in
--external. Held-out sentences are skipped unless --held-out is given (then ONLY they are written).
"""
import argparse
import json
import os
import sys


def read_gold(path):
    files = []
    if os.path.isfile(path):
        files = [path]
    else:
        for root, _dirs, names in os.walk(path):
            files.extend(os.path.join(root, n) for n in sorted(names) if n.endswith(".gold.jsonl"))
    rows = []
    for f in sorted(files):
        with open(f, encoding="utf-8") as fh:
            for line in fh:
                if line.strip():
                    rows.append(json.loads(line))
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--gold", required=True, help="a *.gold.jsonl file or a directory of them")
    ap.add_argument("--out", required=True, help="the editing-format file to write")
    ap.add_argument("--engine", default="newmm")
    ap.add_argument("--held-out", action="store_true")
    args = ap.parse_args()

    from pythainlp.tokenize import word_tokenize  # imported late so --help works without it

    rows = [r for r in read_gold(args.gold) if bool(r.get("heldOut")) == args.held_out]
    if not rows:
        sys.exit("no sentences to segment")
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as out:
        out.write("## segmentation by pythainlp word_tokenize(engine=%r); whitespace tokens kept\n" % args.engine)
        for r in rows:
            text = r["text"]
            tokens = word_tokenize(text, engine=args.engine, keep_whitespace=True)
            if "".join(tokens) != text:
                sys.exit("the engine changed the text of %s; refusing to write a misaligned file" % r["id"])
            out.write("\n# %s%s\n%s\n" % (r["id"], " [held-out]" if r.get("heldOut") else "", "|".join(t for t in tokens if t)))
    print("wrote %d sentences to %s" % (len(rows), args.out))


if __name__ == "__main__":
    main()
