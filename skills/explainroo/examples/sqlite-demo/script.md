# SQLite

> Unofficial demo. Facts come from the SQLite docs on sqlite.org (About
> SQLite, Command Line Shell For SQLite, CLI output modes, STRICT Tables, JSON
> Functions And Operators, Window Functions and the 3.53.0 release log),
> checked on 2026-10-03 with SQLite 3.53.4 (2026-07-24). The terminal output
> was captured on 2026-10-03 from a real interactive run of the official
> precompiled sqlite3 3.53.4 for Linux (sqlite-tools-linux-x64-3530400) in a
> 76 column terminal: the banner, the continuation prompts, the STRICT error,
> the box tables and the backup. The bakery, its orders, the names and the
> pickup times are example data written for this video.

## hook {hold=0.7}
[#name] This is SQLite. [#file] Tables, indexes and views all sit in one file on disk, [#server] and there is no server process.

## open {hold=0.8}
[#open] Type {sqlite3|SQLite three} and a file name. [#new] If the file is not there yet, the shell makes a new one.

## strict {hold=0.9}
[#flex] By default, SQLite is flexible about column types. [#strict] Add STRICT to the table, [#error] and "a dozen" in an integer column is an error.

## box {hold=0.9}
[#insert] Add four orders. [#select] In a terminal, results now come in a box, [#right] and numbers line up on the right.

## json {hold=0.9}
[#json] JSON is stored as ordinary text. [#arrow] The double arrow pulls out one field, [#where] here to find the eight o'clock orders.

## window {hold=1.0}
[#window] A window function adds a running total, [#rows] and the query still returns every row.

## backup {hold=1.0}
[#backup] {.backup|Dot backup} copies the whole database into a new file. [#copy] Open the copy, and all four orders are there.

## outro {hold=0.8}
[#also] explainroo works with any coding agent. [#point] Point yours at the repo and ask for a video. [pause 1.0] [#made] This unofficial demo was made with explainroo.
