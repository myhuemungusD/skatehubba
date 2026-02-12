import { Helmet } from "react-helmet";

interface GameMetaTagsProps {
  gameId?: string;
  playerOne?: string;
  playerTwo?: string;
  gameStatus?: string;
  currentTurn?: number;
  thumbnailUrl?: string;
}

/**
 * SEO and social sharing meta tags for S.K.A.T.E. game pages
 * Optimized for Open Graph (Facebook, LinkedIn) and Twitter Cards
 */
export function GameMetaTags({
  gameId,
  playerOne = "Player 1",
  playerTwo = "Player 2",
  gameStatus = "in progress",
  currentTurn = 0,
  thumbnailUrl,
}: GameMetaTagsProps) {
  const title = gameId
    ? `${playerOne} vs ${playerTwo} - S.K.A.T.E. Battle | SkateHubba`
    : "S.K.A.T.E. Game | SkateHubba";

  const description = gameId
    ? `Watch ${playerOne} and ${playerTwo} battle it out in an async S.K.A.T.E. game. Turn ${currentTurn}, ${gameStatus}. Own your tricks on SkateHubba.`
    : "Play async turn-based S.K.A.T.E. battles with video proof. Challenge skaters worldwide and prove your skills.";

  const url = gameId ? `https://skatehubba.com/play?game=${gameId}` : "https://skatehubba.com/play";

  const image = thumbnailUrl || "https://skatehubba.com/images/og/skatehubba-game-og.png";

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{title}</title>
      <meta name="title" content={title} />
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />

      {/* Open Graph / Facebook / LinkedIn */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:site_name" content="SkateHubba" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={url} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:creator" content="@skatehubba_app" />

      {/* Additional Meta Tags */}
      {gameId && (
        <>
          <meta property="og:video:tag" content="skateboarding" />
          <meta property="og:video:tag" content="SKATE" />
          <meta property="og:video:tag" content="game" />
          <meta
            name="keywords"
            content="skateboarding, SKATE game, skateboarding battle, trick video, skateboarding competition"
          />
        </>
      )}

      {/* Schema.org for Rich Results */}
      {gameId && (
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "VideoGame",
            name: `${playerOne} vs ${playerTwo} - S.K.A.T.E. Battle`,
            description: description,
            gamePlatform: "Web",
            genre: "Sports",
            image: image,
            url: url,
            publisher: {
              "@type": "Organization",
              name: "SkateHubba",
              url: "https://skatehubba.com",
            },
          })}
        </script>
      )}
    </Helmet>
  );
}
