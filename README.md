# NišaRadar

Javni web alat koji za odabranu djelatnost (NKD odjeljak) i općinu/grad pokazuje je li djelatnost
**nedostajuća, u ravnoteži ili zasićena**. Stvarni broj aktivnih poslovnih subjekata iz Sudskog registra
uspoređuje s brojem koji model očekuje za jedinicu lokalne samouprave takve veličine, strukture i razvijenosti.

Rješenje za **Datathon Portala otvorenih podataka 2026.**, izazov C) Gospodarstvo i učinkovito upravljanje.
Pilot: Osječko-baranjska županija.

Detalji projekta, odluke i plan su u [CLAUDE.md](CLAUDE.md).

## Status

Rani razvoj. Trenutno postoji samo klijent za Sudreg API i smoke test (provjera izvedivosti).

## Pokretanje smoke testa

Potrebno: Python 3.11+ i vjerodajnice za [Sudski registar – otvoreni podaci](https://sudreg-data.gov.hr).

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r pipeline\requirements.txt   # na MSYS2 Pythonu: .venv\bin\python.exe
copy .env.example .env      # zatim upiši SUDREG_CLIENT_ID i SUDREG_CLIENT_SECRET i SPREMI datoteku
.\.venv\Scripts\python.exe -X utf8 pipeline\smoke_test.py
```

Smoke test dohvaća token, najnoviji snapshot, brojeve redaka po tablicama i uzorke tablica
(sve s istim `snapshot_id`), mjeri trajanje dohvata i sprema uzorke u `data/raw/` (nije u gitu).
`.env` nikad ne ide u git.

## Podaci i licence

Izvori podataka s izdavačem, poveznicom i licencom navode se u `DATA_SOURCES.md` (u izradi).
Sudski registar: Ministarstvo pravosuđa, uprave i digitalne transformacije, Otvorena dozvola RH (NN 67/17).

Korišteni open-source alati: `requests`, `python-dotenv`, `pandas`, `pyarrow` (licence navedene u `DATA_SOURCES.md`).

## Licenca koda

[EUPL-1.2](LICENSE) (European Union Public Licence v. 1.2).
