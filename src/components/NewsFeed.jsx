export default function NewsFeed({ news, className = '' }) {
  if (!news || news.length === 0) {
    return (
      <div className={`card fade-in ${className}`}>
        <div className="card-header">
          <div className="card-title">Latest News</div>
        </div>
        <div className="empty-state">
          <div className="empty-icon">📰</div>
          <div className="empty-text">
            No news available. Configure your Finnhub API key to enable news feed.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`card fade-in ${className}`}>
      <div className="card-header">
        <div className="card-title">Latest News</div>
        <span className="card-meta">{news.length} articles</span>
      </div>

      <div className="news-list">
        {news.map((article, i) => (
          <a
            key={i}
            className="news-item"
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {article.image && (
              <img
                className="news-image"
                src={article.image}
                alt=""
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
            <div className="news-content">
              <div className="news-headline">{article.headline}</div>
              <div className="news-meta">
                <span className="news-source">{article.source}</span>
                <span className="meta-dot">·</span>
                <span>{formatTimeAgo(article.datetime)}</span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function formatTimeAgo(dateStr) {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = (now - date) / 1000;

    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
