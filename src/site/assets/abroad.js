/**
 * Hello, reader from far away.
 *
 * Loaded only for readers outside the US (site.js loads it when the track
 * beacon reports a non-US country, and abroad.html includes it directly), so
 * US readers never download these translations.
 *
 *   - On any page: a short, dismissible note under the header, in the reader's
 *     language, thanking them for visiting and inviting them to write in.
 *   - On abroad.html: translates the survey, fills in their country, and works
 *     out this week's kickoff in their own time zone.
 *
 * Language: the browser's own languages first (what the reader actually reads),
 * then the country, then English. The survey has a menu to switch.
 *
 * Languages whose grammar bends a country's name (French "du Maroc", German
 * "aus der Schweiz", Portuguese "do Brasil", Italian, Polish) say "from so far
 * away" instead of naming the country, rather than risk getting it wrong.
 *
 * No em dashes in any of this copy, in any language: house style.
 */
(function () {
  'use strict';

  var NBSP = ' ';

  var STRINGS = {
    en: {
      hello: 'Hello!',
      invite_line: 'Reading from {country}? Thanks for stopping by. That alone made my day.',
      invite_line_far: 'Reading from far away? Thanks for stopping by. That alone made my day.',
      invite_cta: 'Got two minutes? Tell me how you ended up a Commanders fan',
      dismiss: 'Close',
      page_title: 'Hello from Charlottesville',
      intro1: "I'm Ben. I run this site from Charlottesville, Virginia, and it still blows my mind that anyone reads it from {country}.",
      intro1_far: "I'm Ben. I run this site from Charlottesville, Virginia, and it still blows my mind that anyone reads it from so far away.",
      intro2: 'Honestly, just visiting is plenty, and I appreciate it. But if you feel like writing in, it would make me really happy. Every question is optional, and you can answer in any language.',
      kickoff: 'This week: Commanders vs. {opponent}. Kickoff where you are: {time}.',
      language: 'Language',
      q_where: 'Where are you reading from?',
      country_label: 'Country',
      city_label: 'City (optional)',
      q_story: 'How did you end up a Washington fan?',
      story_hint: 'Everyone has a story. Mine involves a ditch.',
      q_watch: 'How do you usually watch the games?',
      w_gamepass: 'NFL Game Pass / DAZN',
      w_tv: 'On local TV',
      w_stream: "A stream I won't ask about",
      w_highlights: 'Highlights the next morning',
      w_scores: 'Live score updates and quiet suffering',
      w_other: 'Some other way',
      q_kickoff: "What's the worst kickoff time you've stayed up (or woken up) for?",
      q_player: 'Favorite player, past or present?',
      q_write: 'Anything you want me to write about?',
      q_mention: 'Can I mention you in a post?',
      mention_yes: 'Yes, you can mention me',
      mention_name: 'Name to use (first name and city is perfect)',
      q_email: "Email (only if you'd like a reply)",
      submit: 'Send it to Charlottesville',
      privacy: 'I only see what you type here. Your country comes from your connection, roughly, the way every website sees it, and nothing is saved unless you hit send.',
      thanks: 'Got it, thank you! This genuinely made my day. Hail from Charlottesville.',
    },
    es: {
      hello: '¡Hola!',
      invite_line: '¿Nos lees desde {country}? Gracias por pasar. Solo con eso ya me alegraste el día.',
      invite_line_far: '¿Nos lees desde lejos? Gracias por pasar. Solo con eso ya me alegraste el día.',
      invite_cta: '¿Tienes dos minutos? Cuéntame cómo terminaste siendo fan de los Commanders',
      dismiss: 'Cerrar',
      page_title: 'Saludos desde Charlottesville',
      intro1: 'Soy Ben. Hago este sitio desde Charlottesville, Virginia, y todavía me sorprende que alguien lo lea desde {country}.',
      intro1_far: 'Soy Ben. Hago este sitio desde Charlottesville, Virginia, y todavía me sorprende que alguien lo lea desde tan lejos.',
      intro2: 'La verdad, con tu visita ya es suficiente, y te lo agradezco. Pero si te animas a escribirme, me harías muy feliz. Todas las preguntas son opcionales y puedes responder en el idioma que quieras.',
      kickoff: 'Esta semana: Commanders vs. {opponent}. Inicio en tu zona horaria: {time}.',
      language: 'Idioma',
      q_where: '¿Desde dónde nos lees?',
      country_label: 'País',
      city_label: 'Ciudad (opcional)',
      q_story: '¿Cómo terminaste siendo fan de Washington?',
      story_hint: 'Todos tenemos una historia. La mía incluye una zanja.',
      q_watch: '¿Cómo sueles ver los partidos?',
      w_gamepass: 'NFL Game Pass / DAZN',
      w_tv: 'En la tele local',
      w_stream: 'Un stream del que mejor no pregunto',
      w_highlights: 'Los resúmenes a la mañana siguiente',
      w_scores: 'Siguiendo el marcador en vivo y sufriendo en silencio',
      w_other: 'De otra forma',
      q_kickoff: '¿Cuál es la peor hora a la que te has desvelado (o madrugado) para ver un partido?',
      q_player: '¿Tu jugador favorito, de ahora o de antes?',
      q_write: '¿Sobre qué te gustaría que escribiera?',
      q_mention: '¿Puedo mencionarte en una publicación?',
      mention_yes: 'Sí, puedes mencionarme',
      mention_name: 'Nombre que puedo usar (tu nombre y ciudad es perfecto)',
      q_email: 'Correo (solo si quieres que te responda)',
      submit: 'Enviar a Charlottesville',
      privacy: 'Solo veo lo que escribas aquí. Tu país sale de tu conexión, más o menos como lo ve cualquier sitio web, y no se guarda nada a menos que lo envíes.',
      thanks: '¡Recibido, muchas gracias! De verdad me alegraste el día. Hail desde Charlottesville.',
    },
    pt: {
      hello: 'Olá!',
      invite_line_far: 'Lendo de tão longe? Obrigado pela visita. Só isso já fez o meu dia.',
      invite_cta: 'Tem dois minutinhos? Me conta como você virou fã dos Commanders',
      dismiss: 'Fechar',
      page_title: 'Um oi de Charlottesville',
      intro1_far: 'Eu sou o Ben. Faço este site em Charlottesville, na Virgínia, e ainda acho incrível que alguém leia de tão longe.',
      intro2: 'Sinceramente, a sua visita já basta, e eu agradeço. Mas se quiser escrever, vou ficar muito feliz. Todas as perguntas são opcionais, e você pode responder em qualquer idioma.',
      kickoff: 'Esta semana: Commanders x {opponent}. Começa no seu horário: {time}.',
      language: 'Idioma',
      q_where: 'De onde você está lendo?',
      country_label: 'País',
      city_label: 'Cidade (opcional)',
      q_story: 'Como você virou torcedor de Washington?',
      story_hint: 'Todo mundo tem uma história. A minha envolve uma vala.',
      q_watch: 'Como você costuma assistir aos jogos?',
      w_gamepass: 'NFL Game Pass / DAZN',
      w_tv: 'Na TV local',
      w_stream: 'Uma transmissão que é melhor eu não perguntar',
      w_highlights: 'Os melhores momentos na manhã seguinte',
      w_scores: 'Acompanhando o placar ao vivo e sofrendo em silêncio',
      w_other: 'De outro jeito',
      q_kickoff: 'Qual foi o pior horário em que você ficou acordado (ou acordou) para ver um jogo?',
      q_player: 'Jogador favorito, de hoje ou de antigamente?',
      q_write: 'Sobre o que você gostaria que eu escrevesse?',
      q_mention: 'Posso mencionar você em um post?',
      mention_yes: 'Sim, pode me mencionar',
      mention_name: 'Nome para usar (primeiro nome e cidade é perfeito)',
      q_email: 'E-mail (só se quiser uma resposta)',
      submit: 'Enviar para Charlottesville',
      privacy: 'Eu só vejo o que você escrever aqui. O seu país vem da sua conexão, mais ou menos como qualquer site vê, e nada é salvo a menos que você envie.',
      thanks: 'Recebido, muito obrigado! Isso fez o meu dia de verdade. Hail de Charlottesville.',
    },
    fr: {
      hello: 'Bonjour' + NBSP + '!',
      invite_line_far: 'Vous nous lisez de loin' + NBSP + '? Merci de votre visite, ça suffit déjà à illuminer ma journée.',
      invite_cta: 'Vous avez deux minutes' + NBSP + '? Racontez-moi comment vous êtes devenu fan des Commanders',
      dismiss: 'Fermer',
      page_title: 'Bonjour de Charlottesville',
      intro1_far: "Je m'appelle Ben. Je fais ce site depuis Charlottesville, en Virginie, et je n'en reviens toujours pas qu'on le lise d'aussi loin.",
      intro2: "Franchement, votre visite suffit déjà, et je vous en remercie. Mais si vous avez envie de m'écrire, ça me ferait vraiment plaisir. Toutes les questions sont facultatives, et vous pouvez répondre dans la langue de votre choix.",
      kickoff: 'Cette semaine' + NBSP + ': Commanders contre {opponent}. Coup d’envoi chez vous' + NBSP + ': {time}.',
      language: 'Langue',
      q_where: "D'où nous lisez-vous" + NBSP + '?',
      country_label: 'Pays',
      city_label: 'Ville (facultatif)',
      q_story: 'Comment êtes-vous devenu fan de Washington' + NBSP + '?',
      story_hint: "Tout le monde a son histoire. La mienne implique un fossé.",
      q_watch: "Comment regardez-vous les matchs, d'habitude" + NBSP + '?',
      w_gamepass: 'NFL Game Pass / DAZN',
      w_tv: 'À la télé chez moi',
      w_stream: 'Un stream dont je préfère ne rien savoir',
      w_highlights: 'Les résumés le lendemain matin',
      w_scores: 'Le score en direct, et je souffre en silence',
      w_other: 'Autrement',
      q_kickoff: 'À quelle heure la plus improbable avez-vous veillé (ou mis le réveil) pour un match' + NBSP + '?',
      q_player: "Votre joueur préféré, d'hier ou d'aujourd'hui" + NBSP + '?',
      q_write: "Un sujet sur lequel vous aimeriez que j'écrive" + NBSP + '?',
      q_mention: 'Je peux vous citer dans un article' + NBSP + '?',
      mention_yes: 'Oui, vous pouvez me citer',
      mention_name: "Nom à utiliser (prénom et ville, c'est parfait)",
      q_email: 'E-mail (seulement si vous voulez une réponse)',
      submit: 'Envoyer à Charlottesville',
      privacy: "Je ne vois que ce que vous écrivez ici. Votre pays vient de votre connexion, à peu près comme n'importe quel site le voit, et rien n'est enregistré tant que vous n'envoyez pas.",
      thanks: 'Bien reçu, merci beaucoup' + NBSP + '! Vous avez vraiment illuminé ma journée. Hail de Charlottesville.',
    },
    de: {
      hello: 'Hallo!',
      invite_line_far: 'Du liest von so weit weg mit? Danke für deinen Besuch. Allein das hat mir den Tag versüßt.',
      invite_cta: 'Hast du zwei Minuten? Erzähl mir, wie du Commanders-Fan geworden bist',
      dismiss: 'Schließen',
      page_title: 'Grüße aus Charlottesville',
      intro1_far: 'Ich bin Ben. Ich mache diese Seite in Charlottesville, Virginia, und kann immer noch kaum glauben, dass jemand sie von so weit weg liest.',
      intro2: 'Ehrlich gesagt reicht dein Besuch schon völlig, und ich freue mich darüber. Aber wenn du Lust hast, mir zu schreiben, würde mich das riesig freuen. Alle Fragen sind freiwillig, und du kannst in jeder Sprache antworten.',
      kickoff: 'Diese Woche: Commanders gegen {opponent}. Kickoff bei dir: {time}.',
      language: 'Sprache',
      q_where: 'Von wo aus liest du?',
      country_label: 'Land',
      city_label: 'Stadt (optional)',
      q_story: 'Wie bist du Washington-Fan geworden?',
      story_hint: 'Jeder hat seine Geschichte. Meine hat mit einem Straßengraben zu tun.',
      q_watch: 'Wie schaust du die Spiele normalerweise?',
      w_gamepass: 'NFL Game Pass / DAZN',
      w_tv: 'Im Fernsehen bei mir',
      w_stream: 'Über einen Stream, nach dem ich lieber nicht frage',
      w_highlights: 'Die Highlights am nächsten Morgen',
      w_scores: 'Live-Ticker und stilles Leiden',
      w_other: 'Anders',
      q_kickoff: 'Was war die schlimmste Uhrzeit, zu der du für ein Spiel wach geblieben (oder aufgestanden) bist?',
      q_player: 'Lieblingsspieler, aktuell oder von früher?',
      q_write: 'Worüber soll ich mal schreiben?',
      q_mention: 'Darf ich dich in einem Beitrag erwähnen?',
      mention_yes: 'Ja, du darfst mich erwähnen',
      mention_name: 'Name, den ich verwenden darf (Vorname und Stadt ist perfekt)',
      q_email: 'E-Mail (nur, wenn du eine Antwort möchtest)',
      submit: 'Ab nach Charlottesville',
      privacy: 'Ich sehe nur, was du hier eintippst. Dein Land ergibt sich grob aus deiner Verbindung, so wie bei jeder Website, und gespeichert wird nichts, solange du nicht abschickst.',
      thanks: 'Angekommen, vielen Dank! Du hast mir wirklich den Tag versüßt. Hail aus Charlottesville.',
    },
    it: {
      hello: 'Ciao!',
      invite_line_far: 'Ci leggi da così lontano? Grazie della visita. Già solo questo mi ha fatto felice.',
      invite_cta: 'Hai due minuti? Raccontami come sei diventato tifoso dei Commanders',
      dismiss: 'Chiudi',
      page_title: 'Un saluto da Charlottesville',
      intro1_far: 'Sono Ben. Faccio questo sito da Charlottesville, in Virginia, e ancora non ci credo che qualcuno lo legga da così lontano.',
      intro2: 'Sinceramente, la tua visita basta e avanza, e te ne sono grato. Ma se ti va di scrivermi, mi renderesti davvero felice. Tutte le domande sono facoltative e puoi rispondere in qualsiasi lingua.',
      kickoff: "Questa settimana: Commanders contro {opponent}. Calcio d'inizio da te: {time}.",
      language: 'Lingua',
      q_where: 'Da dove ci leggi?',
      country_label: 'Paese',
      city_label: 'Città (facoltativo)',
      q_story: 'Come sei diventato tifoso di Washington?',
      story_hint: 'Ognuno ha la sua storia. La mia include un fosso.',
      q_watch: 'Di solito come guardi le partite?',
      w_gamepass: 'NFL Game Pass / DAZN',
      w_tv: 'Sulla TV locale',
      w_stream: 'Uno streaming su cui non faccio domande',
      w_highlights: 'Gli highlights la mattina dopo',
      w_scores: 'Il punteggio in diretta e tanta sofferenza in silenzio',
      w_other: 'In un altro modo',
      q_kickoff: "Qual è l'orario più assurdo in cui sei rimasto sveglio (o ti sei svegliato) per una partita?",
      q_player: 'Il tuo giocatore preferito, di oggi o di ieri?',
      q_write: "C'è qualcosa di cui vorresti che scrivessi?",
      q_mention: 'Posso citarti in un post?',
      mention_yes: 'Sì, puoi citarmi',
      mention_name: 'Nome da usare (nome e città vanno benissimo)',
      q_email: 'Email (solo se vuoi una risposta)',
      submit: 'Invia a Charlottesville',
      privacy: 'Vedo solo quello che scrivi qui. Il tuo paese si ricava dalla tua connessione, più o meno come lo vede qualsiasi sito, e non viene salvato nulla finché non invii.',
      thanks: 'Ricevuto, grazie mille! Mi hai davvero fatto felice. Hail da Charlottesville.',
    },
    nl: {
      hello: 'Hallo!',
      invite_line: 'Lees je mee vanuit {country}? Bedankt voor je bezoek. Daar word ik al blij van.',
      invite_line_far: 'Lees je mee van ver weg? Bedankt voor je bezoek. Daar word ik al blij van.',
      invite_cta: 'Heb je twee minuten? Vertel me hoe je fan van de Commanders bent geworden',
      dismiss: 'Sluiten',
      page_title: 'Groeten uit Charlottesville',
      intro1: 'Ik ben Ben. Ik maak deze site vanuit Charlottesville, Virginia, en ik vind het nog steeds ongelooflijk dat iemand hem leest vanuit {country}.',
      intro1_far: 'Ik ben Ben. Ik maak deze site vanuit Charlottesville, Virginia, en ik vind het nog steeds ongelooflijk dat iemand hem van zo ver weg leest.',
      intro2: 'Eerlijk gezegd is je bezoek al meer dan genoeg, en dat waardeer ik. Maar als je zin hebt om me te schrijven, zou ik daar heel blij van worden. Alle vragen zijn optioneel en je mag in elke taal antwoorden.',
      kickoff: 'Deze week: Commanders tegen {opponent}. Aftrap bij jou: {time}.',
      language: 'Taal',
      q_where: 'Waar lees je vandaan?',
      country_label: 'Land',
      city_label: 'Stad (optioneel)',
      q_story: 'Hoe ben je fan van Washington geworden?',
      story_hint: 'Iedereen heeft een verhaal. In het mijne komt een greppel voor.',
      q_watch: 'Hoe kijk je meestal naar de wedstrijden?',
      w_gamepass: 'NFL Game Pass / DAZN',
      w_tv: 'Op de lokale tv',
      w_stream: 'Via een stream waar ik maar niet naar vraag',
      w_highlights: 'De samenvatting de volgende ochtend',
      w_scores: 'Live scores volgen en in stilte lijden',
      w_other: 'Anders',
      q_kickoff: 'Wat is het ergste tijdstip waarop je voor een wedstrijd bent opgebleven (of opgestaan)?',
      q_player: 'Favoriete speler, nu of vroeger?',
      q_write: 'Waar zou je willen dat ik over schrijf?',
      q_mention: 'Mag ik je noemen in een post?',
      mention_yes: 'Ja, je mag me noemen',
      mention_name: 'Naam om te gebruiken (voornaam en stad is perfect)',
      q_email: 'E-mail (alleen als je een antwoord wilt)',
      submit: 'Verstuur naar Charlottesville',
      privacy: 'Ik zie alleen wat je hier invult. Je land komt ruwweg uit je verbinding, zoals elke website dat ziet, en er wordt niets opgeslagen tenzij je het verstuurt.',
      thanks: 'Ontvangen, heel erg bedankt! Je hebt echt mijn dag goedgemaakt. Hail uit Charlottesville.',
    },
    sv: {
      hello: 'Hej!',
      invite_line: 'Läser du från {country}? Tack för att du tittar in. Bara det gjorde min dag.',
      invite_line_far: 'Läser du från långt bort? Tack för att du tittar in. Bara det gjorde min dag.',
      invite_cta: 'Har du två minuter? Berätta hur du blev Commanders-fan',
      dismiss: 'Stäng',
      page_title: 'Hälsningar från Charlottesville',
      intro1: 'Jag heter Ben. Jag gör den här sajten i Charlottesville, Virginia, och jag kan fortfarande inte fatta att någon läser den från {country}.',
      intro1_far: 'Jag heter Ben. Jag gör den här sajten i Charlottesville, Virginia, och jag kan fortfarande inte fatta att någon läser den så långt bort ifrån.',
      intro2: 'Ärligt talat räcker det gott att du tittar in, och jag uppskattar det. Men om du har lust att skriva till mig skulle det göra mig väldigt glad. Alla frågor är frivilliga och du får svara på vilket språk du vill.',
      kickoff: 'Den här veckan: Commanders mot {opponent}. Avspark hos dig: {time}.',
      language: 'Språk',
      q_where: 'Var läser du ifrån?',
      country_label: 'Land',
      city_label: 'Stad (valfritt)',
      q_story: 'Hur blev du Washington-fan?',
      story_hint: 'Alla har en historia. Min innehåller ett dike.',
      q_watch: 'Hur brukar du se matcherna?',
      w_gamepass: 'NFL Game Pass / DAZN',
      w_tv: 'På lokal tv',
      w_stream: 'En stream jag inte frågar om',
      w_highlights: 'Höjdpunkterna morgonen efter',
      w_scores: 'Liveresultat och tyst lidande',
      w_other: 'På annat sätt',
      q_kickoff: 'Vilken är den värsta tid du har varit uppe (eller gått upp) för en match?',
      q_player: 'Favoritspelare, nu eller förr?',
      q_write: 'Något du vill att jag skriver om?',
      q_mention: 'Får jag nämna dig i ett inlägg?',
      mention_yes: 'Ja, du får nämna mig',
      mention_name: 'Namn att använda (förnamn och stad är perfekt)',
      q_email: 'E-post (bara om du vill ha svar)',
      submit: 'Skicka till Charlottesville',
      privacy: 'Jag ser bara det du skriver här. Ditt land kommer ungefär från din uppkoppling, som för alla webbplatser, och inget sparas förrän du skickar.',
      thanks: 'Mottaget, tusen tack! Du gjorde verkligen min dag. Hail från Charlottesville.',
    },
    no: {
      hello: 'Hei!',
      invite_line: 'Leser du fra {country}? Takk for at du kikker innom. Bare det gjorde dagen min.',
      invite_line_far: 'Leser du langt unna? Takk for at du kikker innom. Bare det gjorde dagen min.',
      invite_cta: 'Har du to minutter? Fortell meg hvordan du ble Commanders-fan',
      dismiss: 'Lukk',
      page_title: 'Hilsen fra Charlottesville',
      intro1: 'Jeg heter Ben. Jeg lager denne siden i Charlottesville i Virginia, og jeg kan fortsatt ikke tro at noen leser den fra {country}.',
      intro1_far: 'Jeg heter Ben. Jeg lager denne siden i Charlottesville i Virginia, og jeg kan fortsatt ikke tro at noen leser den så langt unna.',
      intro2: 'Ærlig talt holder det lenge at du er innom, og jeg setter pris på det. Men hvis du har lyst til å skrive, blir jeg kjempeglad. Alle spørsmål er frivillige, og du kan svare på hvilket språk du vil.',
      kickoff: 'Denne uken: Commanders mot {opponent}. Avspark hos deg: {time}.',
      language: 'Språk',
      q_where: 'Hvor leser du fra?',
      country_label: 'Land',
      city_label: 'By (valgfritt)',
      q_story: 'Hvordan ble du Washington-fan?',
      story_hint: 'Alle har en historie. Min involverer en grøft.',
      q_watch: 'Hvordan ser du vanligvis kampene?',
      w_gamepass: 'NFL Game Pass / DAZN',
      w_tv: 'På lokal TV',
      w_stream: 'En strøm jeg ikke spør om',
      w_highlights: 'Høydepunktene morgenen etter',
      w_scores: 'Liveresultater og stille lidelse',
      w_other: 'På en annen måte',
      q_kickoff: 'Hva er det verste tidspunktet du har vært oppe (eller stått opp) for en kamp?',
      q_player: 'Favorittspiller, nå eller før?',
      q_write: 'Noe du vil at jeg skal skrive om?',
      q_mention: 'Kan jeg nevne deg i et innlegg?',
      mention_yes: 'Ja, du kan nevne meg',
      mention_name: 'Navn jeg kan bruke (fornavn og by er perfekt)',
      q_email: 'E-post (bare hvis du vil ha svar)',
      submit: 'Send til Charlottesville',
      privacy: 'Jeg ser bare det du skriver her. Landet ditt kommer omtrent fra tilkoblingen din, slik alle nettsider ser det, og ingenting lagres før du sender.',
      thanks: 'Mottatt, tusen takk! Du gjorde virkelig dagen min. Hail fra Charlottesville.',
    },
    da: {
      hello: 'Hej!',
      invite_line: 'Læser du med fra {country}? Tak fordi du kigger forbi. Bare det gjorde min dag.',
      invite_line_far: 'Læser du med langt væk fra? Tak fordi du kigger forbi. Bare det gjorde min dag.',
      invite_cta: 'Har du to minutter? Fortæl mig, hvordan du blev Commanders-fan',
      dismiss: 'Luk',
      page_title: 'Hilsner fra Charlottesville',
      intro1: 'Jeg hedder Ben. Jeg laver den her side i Charlottesville i Virginia, og jeg kan stadig ikke fatte, at nogen læser den fra {country}.',
      intro1_far: 'Jeg hedder Ben. Jeg laver den her side i Charlottesville i Virginia, og jeg kan stadig ikke fatte, at nogen læser den så langt væk fra.',
      intro2: 'Ærligt talt er dit besøg rigeligt, og jeg sætter pris på det. Men hvis du har lyst til at skrive, ville det gøre mig rigtig glad. Alle spørgsmål er frivillige, og du må svare på det sprog, du vil.',
      kickoff: 'I denne uge: Commanders mod {opponent}. Kickoff hos dig: {time}.',
      language: 'Sprog',
      q_where: 'Hvor læser du fra?',
      country_label: 'Land',
      city_label: 'By (valgfrit)',
      q_story: 'Hvordan blev du Washington-fan?',
      story_hint: 'Alle har en historie. Min involverer en grøft.',
      q_watch: 'Hvordan plejer du at se kampene?',
      w_gamepass: 'NFL Game Pass / DAZN',
      w_tv: 'På lokalt tv',
      w_stream: 'En stream, jeg ikke spørger ind til',
      w_highlights: 'Højdepunkterne morgenen efter',
      w_scores: 'Live-resultater og stille lidelse',
      w_other: 'På en anden måde',
      q_kickoff: 'Hvad er det værste tidspunkt, du har været oppe (eller stået op) for en kamp?',
      q_player: 'Yndlingsspiller, nu eller før?',
      q_write: 'Noget, du gerne vil have, at jeg skriver om?',
      q_mention: 'Må jeg nævne dig i et indlæg?',
      mention_yes: 'Ja, du må nævne mig',
      mention_name: 'Navn, jeg må bruge (fornavn og by er perfekt)',
      q_email: 'E-mail (kun hvis du vil have svar)',
      submit: 'Send til Charlottesville',
      privacy: 'Jeg ser kun det, du skriver her. Dit land kommer cirka fra din forbindelse, ligesom alle hjemmesider ser det, og intet gemmes, før du sender.',
      thanks: 'Modtaget, tusind tak! Du gjorde virkelig min dag. Hail fra Charlottesville.',
    },
    pl: {
      hello: 'Cześć!',
      invite_line_far: 'Czytasz nas z daleka? Dzięki za odwiedziny. Już samo to poprawiło mi dzień.',
      invite_cta: 'Masz dwie minuty? Opowiedz mi, jak to się stało, że kibicujesz Commanders',
      dismiss: 'Zamknij',
      page_title: 'Pozdrowienia z Charlottesville',
      intro1_far: 'Jestem Ben. Robię tę stronę w Charlottesville w Wirginii i wciąż nie mogę uwierzyć, że ktoś czyta ją z tak daleka.',
      intro2: 'Szczerze mówiąc, sama wizyta to już dużo i bardzo ją doceniam. Ale jeśli masz ochotę do mnie napisać, sprawisz mi ogromną radość. Wszystkie pytania są nieobowiązkowe i możesz odpowiadać w dowolnym języku.',
      kickoff: 'W tym tygodniu: Commanders kontra {opponent}. Początek meczu u Ciebie: {time}.',
      language: 'Język',
      q_where: 'Skąd nas czytasz?',
      country_label: 'Kraj',
      city_label: 'Miasto (opcjonalnie)',
      q_story: 'Jak to się stało, że kibicujesz Washington?',
      story_hint: 'Każdy ma swoją historię. W mojej jest rów.',
      q_watch: 'Jak zwykle oglądasz mecze?',
      w_gamepass: 'NFL Game Pass / DAZN',
      w_tv: 'W lokalnej telewizji',
      w_stream: 'Przez stream, o który lepiej nie pytać',
      w_highlights: 'Skróty następnego ranka',
      w_scores: 'Wyniki na żywo i ciche cierpienie',
      w_other: 'Inaczej',
      q_kickoff: 'O jakiej najgorszej godzinie zdarzyło Ci się oglądać mecz?',
      q_player: 'Ulubiony zawodnik, obecny albo dawny?',
      q_write: 'O czym mam napisać?',
      q_mention: 'Czy mogę wspomnieć o Tobie we wpisie?',
      mention_yes: 'Tak, możesz o mnie wspomnieć',
      mention_name: 'Imię, którego mogę użyć (imię i miasto wystarczą)',
      q_email: 'E-mail (tylko jeśli chcesz odpowiedź)',
      submit: 'Wyślij do Charlottesville',
      privacy: 'Widzę tylko to, co tu wpiszesz. Twój kraj wynika mniej więcej z Twojego połączenia, tak jak widzi go każda strona, i nic nie jest zapisywane, dopóki nie wyślesz.',
      thanks: 'Dotarło, wielkie dzięki! To naprawdę poprawiło mi dzień. Hail z Charlottesville.',
    },
    ja: {
      hello: 'こんにちは！',
      invite_line: '{country}から読んでくれているんですか？来てくれてありがとう。それだけで今日はうれしい一日です。',
      invite_line_far: '遠くから読んでくれているんですか？来てくれてありがとう。それだけで今日はうれしい一日です。',
      invite_cta: '2分だけ時間ありますか？コマンダースのファンになったきっかけを教えてください',
      dismiss: '閉じる',
      page_title: 'シャーロッツビルからこんにちは',
      intro1: 'ベンです。バージニア州シャーロッツビルでこのサイトを作っています。{country}から読んでくれる人がいるなんて、今でも信じられません。',
      intro1_far: 'ベンです。バージニア州シャーロッツビルでこのサイトを作っています。こんなに遠くから読んでくれる人がいるなんて、今でも信じられません。',
      intro2: '正直、来てくれただけで十分うれしいです。でも、もし何か書いてくれたら本当に幸せです。質問はすべて任意で、どの言語で答えてもかまいません。',
      kickoff: '今週：コマンダース対{opponent}。あなたの時間でのキックオフ：{time}',
      language: '言語',
      q_where: 'どこから読んでいますか？',
      country_label: '国',
      city_label: '都市（任意）',
      q_story: 'どうしてワシントンのファンになったんですか？',
      story_hint: '誰にでも物語があります。僕の場合は、なぜか溝が関係しています。',
      q_watch: '試合はふだんどうやって見ていますか？',
      w_gamepass: 'NFL Game Pass / DAZN',
      w_tv: '地元のテレビで',
      w_stream: '詳しくは聞かないでおくストリーミングで',
      w_highlights: '翌朝のハイライトで',
      w_scores: '速報スコアを見ながら静かに苦しむ',
      w_other: 'その他',
      q_kickoff: '試合のために起きていた（または早起きした）一番ひどい時間は何時ですか？',
      q_player: '好きな選手は？（現役でも昔の選手でも）',
      q_write: '書いてほしいテーマはありますか？',
      q_mention: 'ブログであなたのことを紹介してもいいですか？',
      mention_yes: 'はい、紹介してもいいです',
      mention_name: '使ってほしい名前（下の名前と都市名で十分です）',
      q_email: 'メールアドレス（返信がほしい場合のみ）',
      submit: 'シャーロッツビルへ送る',
      privacy: '見えるのはここに書いてくれた内容だけです。国はどのサイトでもそうであるように接続からおおまかにわかるもので、送信しない限り何も保存されません。',
      thanks: '届きました、本当にありがとう！おかげで今日は最高の一日です。シャーロッツビルより、Hail。',
    },
    ko: {
      hello: '안녕하세요!',
      invite_line: '{country}에서 읽고 계신가요? 방문해 주셔서 감사해요. 그것만으로도 하루가 즐거워졌어요.',
      invite_line_far: '멀리서 읽고 계신가요? 방문해 주셔서 감사해요. 그것만으로도 하루가 즐거워졌어요.',
      invite_cta: '2분만 시간 있으세요? 커맨더스 팬이 된 이야기를 들려주세요',
      dismiss: '닫기',
      page_title: '샬러츠빌에서 보내는 인사',
      intro1: '저는 벤이에요. 버지니아주 샬러츠빌에서 이 사이트를 만들고 있는데, {country}에서 읽어 주시는 분이 있다니 아직도 신기해요.',
      intro1_far: '저는 벤이에요. 버지니아주 샬러츠빌에서 이 사이트를 만들고 있는데, 이렇게 멀리서 읽어 주시는 분이 있다니 아직도 신기해요.',
      intro2: '솔직히 방문해 주신 것만으로도 충분히 감사해요. 그래도 한 줄 남겨 주신다면 정말 행복할 거예요. 모든 질문은 선택이고, 어떤 언어로 답하셔도 괜찮아요.',
      kickoff: '이번 주: 커맨더스 대 {opponent}. 현지 시간 킥오프: {time}',
      language: '언어',
      q_where: '어디에서 읽고 계신가요?',
      country_label: '국가',
      city_label: '도시 (선택)',
      q_story: '어떻게 워싱턴 팬이 되셨나요?',
      story_hint: '누구에게나 사연이 있죠. 제 사연에는 도랑이 등장해요.',
      q_watch: '경기는 보통 어떻게 보세요?',
      w_gamepass: 'NFL Game Pass / DAZN',
      w_tv: '현지 TV로',
      w_stream: '묻지 않기로 한 스트리밍으로',
      w_highlights: '다음 날 아침 하이라이트로',
      w_scores: '실시간 점수를 보며 조용히 괴로워하며',
      w_other: '기타',
      q_kickoff: '경기 때문에 깨어 있었던(또는 일찍 일어났던) 가장 힘든 시간은 언제였나요?',
      q_player: '가장 좋아하는 선수는? (현역이든 은퇴했든)',
      q_write: '제가 써 줬으면 하는 주제가 있나요?',
      q_mention: '블로그 글에서 소개해도 될까요?',
      mention_yes: '네, 소개해도 돼요',
      mention_name: '사용할 이름 (이름과 도시면 충분해요)',
      q_email: '이메일 (답장을 원하실 때만)',
      submit: '샬러츠빌로 보내기',
      privacy: '제가 보는 건 여기에 적어 주신 내용뿐이에요. 국가는 다른 모든 웹사이트처럼 접속 정보로 대략 알 수 있는 것이고, 보내기 전에는 아무것도 저장되지 않아요.',
      thanks: '잘 받았어요, 정말 고마워요! 덕분에 오늘 하루가 정말 행복해졌어요. 샬러츠빌에서, Hail.',
    },
    'zh-Hans': {
      hello: '你好！',
      invite_line: '你在{country}看我们的网站吗？谢谢你的来访，光是这样就让我开心一整天。',
      invite_line_far: '你在很远的地方看我们的网站吗？谢谢你的来访，光是这样就让我开心一整天。',
      invite_cta: '有两分钟吗？跟我说说你是怎么成为指挥官队球迷的',
      dismiss: '关闭',
      page_title: '来自夏洛茨维尔的问候',
      intro1: '我是 Ben。我在弗吉尼亚州的夏洛茨维尔做这个网站，到现在还是不敢相信有人会在{country}看。',
      intro1_far: '我是 Ben。我在弗吉尼亚州的夏洛茨维尔做这个网站，到现在还是不敢相信有人会在这么远的地方看。',
      intro2: '说真的，你来看看就已经很好了，我很感激。不过如果你愿意写几句，我会非常开心。所有问题都是选填，用什么语言回答都可以。',
      kickoff: '本周：指挥官队对阵{opponent}。你那里的开球时间：{time}',
      language: '语言',
      q_where: '你在哪里看我们的网站？',
      country_label: '国家/地区',
      city_label: '城市（选填）',
      q_story: '你是怎么成为华盛顿球迷的？',
      story_hint: '每个人都有自己的故事。我的故事里有一条水沟。',
      q_watch: '你平时怎么看比赛？',
      w_gamepass: 'NFL Game Pass / DAZN',
      w_tv: '看当地电视台',
      w_stream: '看某个我不便多问的直播',
      w_highlights: '第二天早上看集锦',
      w_scores: '盯着实时比分默默受煎熬',
      w_other: '其他方式',
      q_kickoff: '你为了看比赛熬夜（或早起）到过最离谱的时间是几点？',
      q_player: '你最喜欢的球员是谁？（现役或退役都可以）',
      q_write: '有什么想让我写的话题吗？',
      q_mention: '我可以在文章里提到你吗？',
      mention_yes: '可以，欢迎提到我',
      mention_name: '希望使用的名字（名字加城市就很好）',
      q_email: '电子邮箱（想收到回复时再填）',
      submit: '寄往夏洛茨维尔',
      privacy: '我只能看到你在这里写的内容。你的国家/地区和任何网站一样，是根据网络连接大致判断的，除非你提交，否则什么都不会保存。',
      thanks: '收到了，非常感谢！你真的让我开心了一整天。来自夏洛茨维尔的 Hail。',
    },
    'zh-Hant': {
      hello: '你好！',
      invite_line: '你在{country}看我們的網站嗎？謝謝你的造訪，光是這樣就讓我開心一整天。',
      invite_line_far: '你在很遠的地方看我們的網站嗎？謝謝你的造訪，光是這樣就讓我開心一整天。',
      invite_cta: '有兩分鐘嗎？跟我說說你是怎麼成為指揮官隊球迷的',
      dismiss: '關閉',
      page_title: '來自夏洛茨維爾的問候',
      intro1: '我是 Ben。我在維吉尼亞州的夏洛茨維爾經營這個網站，到現在還是不敢相信有人會在{country}看。',
      intro1_far: '我是 Ben。我在維吉尼亞州的夏洛茨維爾經營這個網站，到現在還是不敢相信有人會在這麼遠的地方看。',
      intro2: '說真的，你來看看就已經很好了，我很感謝。不過如果你願意寫幾句，我會非常開心。所有問題都是選填，用什麼語言回答都可以。',
      kickoff: '本週：指揮官隊對上{opponent}。你那裡的開球時間：{time}',
      language: '語言',
      q_where: '你在哪裡看我們的網站？',
      country_label: '國家／地區',
      city_label: '城市（選填）',
      q_story: '你是怎麼成為華盛頓球迷的？',
      story_hint: '每個人都有自己的故事。我的故事裡有一條水溝。',
      q_watch: '你平常怎麼看比賽？',
      w_gamepass: 'NFL Game Pass / DAZN',
      w_tv: '看當地電視台',
      w_stream: '看某個我不便多問的直播',
      w_highlights: '隔天早上看精華',
      w_scores: '盯著即時比分默默受煎熬',
      w_other: '其他方式',
      q_kickoff: '你為了看比賽熬夜（或早起）到過最誇張的時間是幾點？',
      q_player: '你最喜歡的球員是誰？（現役或退役都可以）',
      q_write: '有什麼想讓我寫的主題嗎？',
      q_mention: '我可以在文章裡提到你嗎？',
      mention_yes: '可以，歡迎提到我',
      mention_name: '希望使用的名字（名字加城市就很好）',
      q_email: '電子郵件（想收到回覆時再填）',
      submit: '寄往夏洛茨維爾',
      privacy: '我只看得到你在這裡寫的內容。你的國家／地區和任何網站一樣，是根據網路連線大致判斷的，除非你送出，否則什麼都不會儲存。',
      thanks: '收到了，非常感謝！你真的讓我開心了一整天。來自夏洛茨維爾的 Hail。',
    },
  };

  // Each language's own name for itself, for the switcher.
  var LANGS = [
    ['en', 'English'], ['es', 'Español'], ['pt', 'Português'], ['fr', 'Français'],
    ['de', 'Deutsch'], ['it', 'Italiano'], ['nl', 'Nederlands'], ['sv', 'Svenska'],
    ['no', 'Norsk'], ['da', 'Dansk'], ['pl', 'Polski'], ['ja', '日本語'],
    ['ko', '한국어'], ['zh-Hans', '简体中文'], ['zh-Hant', '繁體中文'],
  ];

  // Fallback when the browser's languages aren't ones we have.
  var COUNTRY_LANG = {
    MX: 'es', ES: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es', EC: 'es', GT: 'es', CU: 'es',
    BO: 'es', DO: 'es', HN: 'es', PY: 'es', SV: 'es', NI: 'es', CR: 'es', PA: 'es', UY: 'es', PR: 'es', GQ: 'es',
    BR: 'pt', PT: 'pt', AO: 'pt', MZ: 'pt',
    FR: 'fr', MA: 'fr', DZ: 'fr', TN: 'fr', SN: 'fr', CI: 'fr', MC: 'fr', LU: 'fr',
    DE: 'de', AT: 'de', CH: 'de', LI: 'de',
    IT: 'it', SM: 'it',
    NL: 'nl', BE: 'nl',
    SE: 'sv', NO: 'no', DK: 'da', PL: 'pl', JP: 'ja', KR: 'ko',
    CN: 'zh-Hans', SG: 'zh-Hans', TW: 'zh-Hant', HK: 'zh-Hant', MO: 'zh-Hant',
  };

  // English country names that read wrong without "the".
  var ENGLISH_THE = { NL: 1, PH: 1, BS: 1, GM: 1, DO: 1, CF: 1, CD: 1, MV: 1, KY: 1, MH: 1, SB: 1, VG: 1, TC: 1, FO: 1, FK: 1, KM: 1, AE: 1, GB: 1 };

  // BCP 47 tags for formatting dates and country names.
  var LOCALE = { 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW', no: 'nb' };

  var STORE_KEY = 'bw_abroad'; // "dismissed" or "done"

  function storedState() { try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; } }
  function remember(v) { try { localStorage.setItem(STORE_KEY, v); } catch (e) {} }
  function isAdmin() { return document.cookie.split(';').some(function (c) { return c.trim().indexOf('admin_session=') === 0; }); }
  function param(name) { return new URLSearchParams(window.location.search).get(name); }

  function supported(tag) {
    if (!tag) return null;
    var t = String(tag).toLowerCase();
    if (t.indexOf('zh') === 0) return /hant|tw|hk|mo/.test(t) ? 'zh-Hant' : 'zh-Hans';
    var base = t.split('-')[0];
    if (base === 'nb' || base === 'nn') base = 'no';
    return STRINGS[base] ? base : null;
  }

  function pickLang(country) {
    var forced = supported(param('lang'));
    if (forced) return forced;
    var prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    // The browser's own list, in its order: a reader in Germany whose browser
    // is set to English reads English, and gets it.
    for (var i = 0; i < prefs.length; i++) {
      var s = supported(prefs[i]);
      if (s) return s;
    }
    return (country && COUNTRY_LANG[country]) || 'en';
  }

  function countryName(code, lang) {
    if (!code) return '';
    try {
      var name = new Intl.DisplayNames([LOCALE[lang] || lang], { type: 'region' }).of(code);
      if (lang === 'en' && ENGLISH_THE[code]) name = 'the ' + name;
      return name || code;
    } catch (e) { return code; }
  }

  function t(lang, key, vars) {
    var s = (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || '';
    return s.replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? vars[k] : ''; });
  }

  // A line that names the country where the language can, "from far away"
  // where it can't (or the country's unknown).
  function withCountry(lang, key, country) {
    var named = STRINGS[lang] && STRINGS[lang][key];
    if (named && country) return t(lang, key, { country: countryName(country, lang) });
    return t(lang, key + '_far');
  }

  /* ---------- The note under the header, on every page ---------- */

  function invite(country) {
    if (document.querySelector('.abroad-invite') || document.getElementById('abroad-survey')) return;
    var previewing = !!param('country');
    if (!previewing && (storedState() || isAdmin())) return;
    var lang = pickLang(country);
    var note = document.createElement('aside');
    note.className = 'abroad-invite';
    note.setAttribute('lang', LOCALE[lang] || lang);
    note.setAttribute('aria-label', t(lang, 'hello'));
    var href = 'abroad.html?country=' + encodeURIComponent(country) + '&lang=' + encodeURIComponent(lang);
    note.innerHTML =
      '<p class="abroad-invite-text"><strong class="abroad-invite-hello"></strong> <span class="abroad-invite-line"></span> ' +
      '<a class="abroad-invite-link"></a></p>' +
      '<button class="abroad-invite-close" type="button">&times;</button>';
    note.querySelector('.abroad-invite-hello').textContent = t(lang, 'hello');
    note.querySelector('.abroad-invite-line').textContent = withCountry(lang, 'invite_line', country);
    var link = note.querySelector('.abroad-invite-link');
    link.textContent = t(lang, 'invite_cta') + ' →';
    link.href = href;
    var close = note.querySelector('.abroad-invite-close');
    close.setAttribute('aria-label', t(lang, 'dismiss'));
    close.addEventListener('click', function () { note.remove(); remember('dismissed'); });
    var hero = document.querySelector('.hero');
    if (hero) hero.insertAdjacentElement('afterend', note);
    else document.body.insertAdjacentElement('afterbegin', note);
  }

  /* ---------- abroad.html ---------- */

  var surveyCountry = null;
  var surveyLang = null;

  function renderSurvey() {
    var root = document.getElementById('abroad-survey');
    if (!root) return;
    var lang = surveyLang;
    document.documentElement.setAttribute('lang', LOCALE[lang] || lang);

    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(lang, el.getAttribute('data-i18n'));
    });
    var intro = root.querySelector('[data-i18n-intro]');
    if (intro) intro.textContent = withCountry(lang, 'intro1', surveyCountry);
    var title = t(lang, 'page_title');
    document.title = title + ' | The Burgundy Wire';

    // Country: filled in for them, in their language, unless they've typed
    // their own.
    var countryInput = root.querySelector('input[name="country"]');
    if (countryInput && surveyCountry && (!countryInput.value || countryInput.dataset.auto === '1')) {
      countryInput.value = countryName(surveyCountry, lang).replace(/^the /, '');
      countryInput.dataset.auto = '1';
    }
    var codeInput = root.querySelector('input[name="country_code"]');
    if (codeInput && surveyCountry) codeInput.value = surveyCountry;
    var langInput = root.querySelector('input[name="lang"]');
    if (langInput) langInput.value = lang;

    // This week's kickoff, in the reader's own time zone (the browser's, so
    // it's right even where the country spans several).
    var k = root.querySelector('[data-kickoff]');
    if (k) {
      var when = new Date(k.getAttribute('data-kickoff'));
      if (!isNaN(when) && when > new Date()) {
        var time = when.toLocaleString(LOCALE[lang] || lang, { weekday: 'long', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
        k.textContent = t(lang, 'kickoff', { opponent: k.getAttribute('data-opponent'), time: time });
        k.hidden = false;
      } else {
        k.hidden = true;
      }
    }

    var select = root.querySelector('#abroad-lang');
    if (select) select.value = lang;
  }

  function survey(country) {
    var root = document.getElementById('abroad-survey');
    if (!root) return;
    if (country && country !== 'US') surveyCountry = country;
    if (!surveyLang) surveyLang = pickLang(surveyCountry);

    var select = root.querySelector('#abroad-lang');
    if (select && !select.options.length) {
      LANGS.forEach(function (l) {
        var o = document.createElement('option');
        o.value = l[0];
        o.textContent = l[1];
        select.appendChild(o);
      });
      select.addEventListener('change', function () { surveyLang = select.value; renderSurvey(); });
      select.closest('.abroad-lang-row').hidden = false;
    }

    var form = root.querySelector('form[name="abroad"]');
    if (form && !form.dataset.wired) {
      form.dataset.wired = '1';
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var done = function () {
          var p = document.createElement('p');
          p.className = 'abroad-thanks';
          p.textContent = t(surveyLang, 'thanks');
          form.replaceWith(p);
          remember('done');
          p.scrollIntoView({ block: 'center', behavior: 'smooth' });
        };
        fetch('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(new FormData(form)).toString(),
        }).then(done, done);
      });
    }

    renderSurvey();
  }

  window.bwAbroad = {
    start: function (country) {
      if (document.getElementById('abroad-survey')) survey(country);
      else invite(country);
    },
  };

  // On abroad.html itself, start straight away with whatever's known: the
  // ?country= the invite link carried, or nothing until the beacon answers.
  if (document.getElementById('abroad-survey')) {
    var fromUrl = (param('country') || '').toUpperCase();
    survey(/^[A-Z]{2}$/.test(fromUrl) ? fromUrl : window.__bwCountry || null);
  }
})();
