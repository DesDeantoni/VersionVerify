/**
 * diff.js — Myers-inspired word-level diff
 * Produces an array of {type, value} ops: type = 'equal'|'insert'|'delete'
 */

(function (global) {
  function tokenize(text) {
    // Split on word boundaries while keeping whitespace as tokens
    return text.match(/\S+|\s+/g) || [];
  }

  function lcs(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
        else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    return dp;
  }

  function backtrack(dp, a, b, i, j, ops) {
    if (i === 0 && j === 0) return;
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      backtrack(dp, a, b, i - 1, j - 1, ops);
      ops.push({ type: 'equal', value: a[i - 1] });
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      backtrack(dp, a, b, i, j - 1, ops);
      ops.push({ type: 'insert', value: b[j - 1] });
    } else {
      backtrack(dp, a, b, i - 1, j, ops);
      ops.push({ type: 'delete', value: a[i - 1] });
    }
  }

  function diff(oldText, newText) {
    const a = tokenize(oldText);
    const b = tokenize(newText);
    const dp = lcs(a, b);
    const ops = [];
    backtrack(dp, a, b, a.length, b.length, ops);
    return ops;
  }

  function renderDiff(ops) {
    return ops.map(op => {
      const escaped = op.value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      if (op.type === 'insert') return `<span class="add">${escaped}</span>`;
      if (op.type === 'delete') return `<span class="del">${escaped}</span>`;
      return escaped;
    }).join('');
  }

  global.Diff = { diff, renderDiff, tokenize };
})(window);
