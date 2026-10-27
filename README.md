# Tavlan

Räkna dartmatcher i telefonen. Välj spelare, startpoäng och hur man måste gå ut. Matchen sparas i webbläsaren på enheten — ingen server och inget konto.

## Regler på tavlan

- Varje runda är upp till tre pilar. Poängen räknas ner från startpoängen.
- **Dubbel:** sista pilen måste vara dubbel eller bull. Att lämna 1 är tjock.
- **Trippel:** sista pilen måste vara trippel.
- **Inget krav:** vilken pil som helst får gå ut, så länge det blir exakt.
- Går man över, lämnar 1 på dubbel, eller går ut med fel krav stryks hela rundan.
- Innan rundan, när en tjock fortfarande är möjlig, kan poängen skrivas in i stället för att klicka pil för pil. Fel utgång blir tjock.
- Nästa leg startas varannan spelare, eller av den som gick ut, beroende på vad ni valde.
- Ångra finns för senaste pilen, inskrivna rundan och legbytet.

Allt ligger i `localStorage` under nyckeln `tavlan.v1`.

## Lokalt

Moduler kräver en webbserver. Öppna inte filen direkt.

```bash
npm test
python3 -m http.server 8765
```

Sedan: [http://localhost:8765](http://localhost:8765)

## Sidan

https://samvarahram.github.io/dart-site/

Push till `main` kör GitHub Actions (`.github/workflows/pages.yml`): testerna körs, och sidan publiceras med GitHub Pages.
