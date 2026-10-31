# Finanze

Webapp minimalista per gestire portafogli, abbonamenti e scadenze, con una sezione **Business** per chi ha un'azienda.
Nessun server, nessun account, nessuna dipendenza: sono solo file statici. I dati restano nel tuo browser e si salvano/ripristinano con un backup **JSON**.

## Pubblicarla su GitHub (e installarla)

1. Crea un repository su GitHub (es. `finanze`) e carica **tutti i file di questa cartella** nella radice (Add file → Upload files).
2. Vai su **Settings → Pages**, in *Build and deployment* scegli **Deploy from a branch**, branch `main`, cartella `/ (root)`, poi *Save*.
3. Dopo circa un minuto l'app è online su `https://<tuo-utente>.github.io/<nome-repo>/`.
4. Installala:
   - **Android / PC (Chrome, Edge)**: menu ⋮ → *Installa app*.
   - **iPhone / iPad (Safari)**: Condividi → *Aggiungi a Home*.

Per aggiornarla basta sostituire i file nel repository: al successivo avvio l'app si aggiorna da sola. I dati non vengono toccati.

> Prova in locale: apri la cartella con un server statico (`python3 -m http.server`) e vai su `http://localhost:8000`.

## Cosa fa

**Personale**
- **Portafogli** rinominabili: conti correnti (anche di più banche), carte conto/prepagate, carte di credito, risparmio, contanti.
- **Carte di credito** con plafond mensile: la spesa riduce il disponibile e, il giorno di addebito del mese dopo, l'importo viene scalato in automatico dal conto collegato.
- **Imposta di bollo**: spunta "soggetto a bollo" su un conto; l'addebito (annuale al 31/12 o trimestrale) viene registrato in automatico dalla data di attivazione.
- **Giroconti** tra i tuoi conti.
- **Abbonamenti** ricorrenti (Netflix, iCloud…) con addebito automatico sul portafoglio scelto e totale mensile/annuale.
- **Scadenze** non automatiche (assicurazioni, bollette, affitto…) con promemoria, ripetizione opzionale e registrazione del pagamento.

**Business** (si attiva da ⚙︎ → "Sono titolare di un'azienda")
- Conti e carte aziendali separati da quelli personali, abbonamenti e scadenze propri.
- **Incassi**: fatture da incassare con promemoria.
- **Pagamenti**: fornitori, stipendi e compensi amministratori (anche ricorrenti).
- **Team & benefit**: rimborsi chilometrici, buoni pasto, fringe benefit con contatore del limite annuo (1.000 € di default, modificabile per persona).

## Backup

⚙︎ → *Esporta backup JSON* scarica tutto in un file; *Importa backup* lo ripristina (sostituisce i dati attuali). L'app ti ricorda il backup se sono passati più di 30 giorni. I dati stanno solo su questo dispositivo: per usare l'app su più dispositivi esporta da uno e importa sull'altro.

## Note

- L'addebito automatico delle carte considera le spese del mese di calendario e le addebita il giorno scelto del mese successivo. Una spesa inserita con data in un mese già addebitato non genera un nuovo addebito.
- I valori di bollo (34,20 €/anno), tariffa km e limite fringe sono preimpostati ma modificabili: verifica con il tuo commercialista quelli in vigore.
- Strumento di organizzazione personale, non un software di contabilità.

## File

`index.html` · `style.css` · `app.js` (tutta la logica) · `sw.js` (uso offline) · `manifest.webmanifest` e icone (installazione come app)
