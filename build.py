#!/usr/bin/env python3
"""Genera data/ desde disponibles.txt (solo lectura). Un archivo por caracter
inicial y all.json con todo, con las palabras pegadas de a 4 caracteres."""

import json
import os

SRC = "disponibles.txt"
OUT = "data"
LEN = 4
ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789_"
ORDER = {c: i for i, c in enumerate(ALPHABET)}
VALID = set(ALPHABET)


def main():
    words = set()
    bad = []
    bad_count = 0
    total_lines = 0

    with open(SRC, "r", encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            word = line.strip()
            if not word:
                continue
            total_lines += 1
            if len(word) != LEN or any(c not in VALID for c in word):
                bad_count += 1
                if len(bad) < 20:
                    bad.append((lineno, word))
                continue
            words.add(word)

    ordered = sorted(words, key=lambda w: [ORDER[c] for c in w])

    os.makedirs(OUT, exist_ok=True)
    for stale in os.listdir(OUT):
        if stale.endswith(".json"):
            os.remove(os.path.join(OUT, stale))

    groups = {}
    for w in ordered:
        groups.setdefault(w[0], []).append(w)

    for ch, group in groups.items():
        with open(os.path.join(OUT, ch + ".json"), "w", encoding="utf-8") as fh:
            json.dump("".join(group), fh)

    with open(os.path.join(OUT, "all.json"), "w", encoding="utf-8") as fh:
        json.dump("".join(ordered), fh)

    letters = {c: len(groups.get(c, [])) for c in ALPHABET}
    index = {
        "total": len(ordered),
        "alphabet": ALPHABET,
        "length": LEN,
        "letters": letters,
    }
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, separators=(",", ":"))

    size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))

    print(f"lineas leidas   : {total_lines}")
    print(f"duplicados      : {total_lines - len(ordered)}")
    print(f"validas unicas  : {len(ordered)}")
    print(f"descartadas     : {bad_count}" + (f"  ej. {bad[:3]}" if bad else ""))
    print(f"archivos        : {len(groups)} por letra + all.json + index.json")
    print(f"data/ total     : {size / 1e6:.2f} MB")
    print(f"all.json        : {os.path.getsize(os.path.join(OUT, 'all.json')) / 1e6:.2f} MB")
    print(f"mayor archivo   : {max(len(v) for v in groups.values())} palabras")
    print(f"letras en 0     : {[c for c in ALPHABET if letters[c] == 0]}")


if __name__ == "__main__":
    main()
