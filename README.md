# BUZZ

Un buzzer multijoueur en français, prêt à héberger sur Vercel. React + TypeScript + Vite pour le site, Supabase pour l'identité anonyme, PostgreSQL et les événements temps réel.

## Démarrer

1. Installer Node.js 22.12+ (ou une version récente compatible avec Vite).
2. Exécuter `npm install` (sous PowerShell, utiliser `npm.cmd` si les scripts sont bloqués).
3. Créer un projet [Supabase](https://supabase.com).
4. Dans **Authentication → Sign In / Providers**, activer **Allow anonymous sign-ins**. Aucun e-mail ou mot de passe n'est demandé aux joueurs.
5. Dans **SQL Editor**, exécuter une fois le contenu de `supabase/schema.sql` dans une nouvelle base. Il crée les tables, les droits, les fonctions et active la publication Realtime.
6. Copier `.env.example` vers `.env` et renseigner l'URL du projet et sa clé **publishable** (ou sa clé publique `anon`). Ne jamais mettre de clé `service_role` ou de clé secrète dans le frontend.
7. Exécuter `npm run dev`, puis ouvrir l'adresse affichée.

Sans variables Supabase, l'accueil s'affiche ; créer ou rejoindre une room indique la configuration manquante. Aucun faux multijoueur local n'est utilisé.

## Déployer sur Vercel

Initialiser toi-même Git, puis pousser ce dossier dans ton dépôt. Aucun `git init` n'a été exécuté pour préparer le projet.

1. Importer le dépôt dans Vercel.
2. Garder le preset **Vite**, la commande `npm run build` et le dossier de sortie `dist`.
3. Ajouter `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` aux variables d'environnement des environnements souhaités.
4. Déployer. Après toute modification de ces variables, relancer un déploiement : Vite les intègre à la compilation.

Toutes les rooms utilisent `/?room=ABC123` : aucune règle de réécriture n'est nécessaire. Le temps réel utilise directement Supabase ; aucun serveur WebSocket permanent n'est nécessaire sur Vercel.

## Jouer

- Choisir un pseudo (1 à 20 caractères) et créer une room.
- Copier le lien d'invitation ou partager le code de 6 caractères.
- Les autres joueurs saisissent leur pseudo avant de rejoindre. Les pseudos sont uniques dans chaque room, sans distinction de casse.
- Buzzer au clic, au toucher, ou à la touche espace. L'espace ne déclenche pas le buzzer pendant la saisie ou sur un autre contrôle ; un bouton focalisé conserve son activation clavier native.
- Le premier buzz **traité par la base** gagne. La latence réseau peut influencer l'ordre : ce n'est pas une mesure du temps de réaction local.
- Seul l'hôte lance la manche suivante. Il peut aussi buzzer.
- Actualiser le navigateur conserve l'identité et propose de rejoindre la même room. Quitter retourne à l'accueil ; les pseudos restent inscrits dans la room, la liste n'est pas un indicateur de présence.

L'identité est propre au profil du navigateur. Pour tester plusieurs joueurs sur un ordinateur, utiliser des profils différents ou une fenêtre privée. Les onglets du même profil partagent une identité.

## Garanties et vérification

Les écritures passent par des fonctions PostgreSQL sécurisées. Un verrou sur la room départage les appels ; les anciennes manches sont refusées, le reset est réservé à l'hôte, et les lectures sont limitées aux membres par RLS. Les mises à jour sont versionnées pour éviter qu'une ancienne réponse ne remplace un état plus récent. Realtime synchronise le résultat, avec une relecture toutes les 5 secondes et au retour sur la fenêtre.

`npm test` exécute le vrai schéma SQL dans PostgreSQL embarqué (PGlite) : pseudos, accès, premier gagnant, relance, appels répétés, buzz périmés et restrictions RLS. Cela ne remplace pas un test réseau avec deux navigateurs connectés au projet Supabase.

`npm run build` vérifie TypeScript et produit le site dans `dist`.

Test manuel après configuration : créer une room dans un navigateur, rejoindre dans un autre, buzzer des deux côtés, vérifier le même gagnant, relancer en tant qu'hôte, essayer espace sur ordinateur et le toucher sur mobile, couper puis rétablir la connexion.

Les rooms ne sont pas supprimées automatiquement. Pour un déploiement public à grande échelle, prévoir une politique de purge et la protection anti-abus des connexions anonymes dans Supabase. Une room accepte au plus 50 pseudos et chaque identité peut créer jusqu'à 20 rooms par heure.

Documentation : [Vite sur Vercel](https://vercel.com/docs/frameworks/frontend/vite), [authentification anonyme Supabase](https://supabase.com/docs/guides/auth/auth-anonymous), [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).
