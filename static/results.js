:root {
    --text: #1a1a1b;
    --muted: #787c7e;
    --border: #d3d6da;

    --green: #6aaa64;
    --red: #d9534f;

    --surface: #ffffff;
}

* {
    box-sizing: border-box;
}

html,
body {
    min-height: 100%;
}

body {
    margin: 0;

    background: var(--surface);

    color: var(--text);

    font-family:
        Arial,
        Helvetica,
        sans-serif;
}

.results-page {
    min-height: 100dvh;

    display: flex;

    align-items: center;

    justify-content: center;

    padding: 20px;
}

.results-card {
    width: min(440px, 100%);

    text-align: center;
}

.evil {
    font-size: 13px;

    letter-spacing: 3px;

    font-weight: 800;

    color: var(--muted);

    margin-bottom: 18px;
}

.results-card h1 {
    font-size: 28px;

    line-height: 1.2;

    margin:
        0
        0
        28px;
}

.result-summary {
    font-size: 18px;

    font-weight: 700;

    margin-bottom: 24px;
}

.game-results {
    display: grid;

    gap: 10px;

    margin-bottom: 28px;
}

.game-result {
    border: 1px solid var(--border);

    border-radius: 8px;

    padding: 14px 16px;

    display: flex;

    align-items: center;

    justify-content: space-between;
}

.game-result-left {
    display: flex;

    align-items: center;

    gap: 12px;

    text-align: left;
}

.game-number {
    width: 30px;
    height: 30px;

    border-radius: 50%;

    display: grid;

    place-items: center;

    background: #eee;

    font-size: 13px;

    font-weight: 800;
}

.game-name {
    font-weight: 800;

    font-size: 14px;
}

.game-status {
    font-size: 13px;

    font-weight: 800;
}

.game-status.win {
    color: var(--green);
}

.game-status.loss {
    color: var(--red);
}

.share-btn,
.play-btn {
    width: 100%;

    height: 48px;

    border-radius: 6px;

    cursor: pointer;

    font-weight: 800;
}

.share-btn {
    border: 0;

    background: var(--text);

    color: white;

    margin-bottom: 10px;
}

.play-btn {
    border: 1px solid var(--border);

    background: white;

    color: var(--text);
}

.share-btn:active,
.play-btn:active {
    transform: scale(.98);
}

@media (max-width: 400px) {

    .results-card h1 {
        font-size: 24px;
    }

}
