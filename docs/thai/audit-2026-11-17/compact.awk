function flush() { if (w != "") print w r al c p s d n; }
/^«/ { flush(); w=$0; r=""; al=""; c=""; p=""; s=""; d=""; n=""; next }
/^    ⇒/ { x=$0; sub(/^    /,"",x); r="\n   " x; next }
/^    [0-9]+ tokens:/ { x=$0; sub(/^    /,"",x); r="\n   " x; next }
/^    also:/ { x=$0; sub(/^    /,"",x); al=" | " x; next }
/^    C:/ { x=$0; sub(/^    /,"",x); c=" | " x; next }
/^    P:/ { x=$0; sub(/^    /,"",x); p=" | " x; next }
/^    S:/ { x=$0; sub(/^    /,"",x); s=" | " x; next }
/^    D:/ { x=$0; sub(/^    /,"",x); d=" | " substr(x,1,75); next }
/^    notes:/ { if ($0 ~ /Not an entry|part of the word/) { x=$0; sub(/^    notes: /,"",x); n=" | N: " substr(x,1,80) } next }
END { flush() }
