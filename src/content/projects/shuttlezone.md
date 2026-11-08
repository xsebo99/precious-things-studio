---
title: 'ShuttleZone: one home for German badminton'
description: A badminton platform that recomputes player ratings from 1.2 million scraped matches and puts rankings, leagues, tournaments and team organisation in one app.
date: 2026-09-26
tags: [python, astro, cloudflare, sqlite, scraping]
status: in progress
---

If you play league badminton in Germany, your information is spread across several sites. Ratings live on one site, tournament draws and results on another, league tables on a third, and team organisation usually happens in yet another app. **ShuttleZone** brings them together in one place.

## What's in it

- **Ratings and profiles.** Every player gets a profile with ratings in six lists (singles, doubles and mixed, for men and women), their history over the seasons, a career high and a comparison view.
- **Leagues.** Tables, schedules and results for each division, plus team pages with fixtures, registered squads and match reports. Each match report has its own shareable link.
- **Tournaments.** Upcoming tournaments with entry deadlines and filters, and a personal watchlist.
- **Accounts.** Follow players, teams and divisions, see what's new since your last visit, subscribe to a calendar feed, and get a daily digest of new results and postponed fixtures.
- **Team spaces.** Teams can organise trainings and match days, answer yes, maybe or no, and see an opponent analysis that compares both squads before a match.

## The data pipeline

The core is a Python project that collects the data and computes the ratings:

```
tournament & league sites ──scrape──> JSON + cached HTML ─┐
official rating history ────scrape──> seed values ────────┴─load──> SQLite
SQLite ──rate / export──> static JSON ──upload──> Cloudflare R2
```

Scraping is resumable and caches every page, so a parser fix can be replayed offline over the cache without hitting any site again. All the data is loaded into SQLite, the rating engine runs over it, and the export writes static JSON files for the website.

The current dataset covers 3,621 tournaments and league seasons from 2022 to today: **1.23 million matches**, 842,000 of them rated, and **55,000 players**.

## Recomputing the ratings

The German badminton federation publishes official ratings, but only once per season. ShuttleZone recomputes them from the match results so they move as the season goes on. These are an **unofficial recomputation**, not the official values.

Getting close to the official numbers took a lot of edge cases. For example:

- **Starting values.** Official values up to 2021/22 seed the calculation. Players without one start at a provisional value, calibrated separately for adults and youth against the official rankings.
- **Opponents count with their previous value.** That's how the official system does it, so the engine does too.
- **Mixed-gender matches.** A boy against a girl in singles, or a mixed pair against a same-gender pair, counts in each player's own list. Matching the official game counts confirmed that rule.

A `compare-official` command checks the recomputed values against the official ones per season, list and regional association.

## The website

The site is built with **Astro** and **TypeScript** and deployed to **Cloudflare Workers**. Code and data ship separately:

- **Code** deploys through GitHub Actions on every push to `main`, after type checks and the Python test suite pass.
- **Data** lives in a Cloudflare R2 bucket. The upload compares each file's MD5 with the bucket's ETag and only sends what changed. It uploads the index last, so visitors never see a half-updated dataset.

Accounts run on a small Worker API with a D1 database, with hashed passwords and tokens, rate limits and strict security headers. ShuttleZone can be installed as a web app on the home screen.

## Status

ShuttleZone is in a closed test phase. The next step is trying the team spaces with a real team and collecting feedback before opening it up. A transfer market for players looking for a new club is next on the roadmap.
