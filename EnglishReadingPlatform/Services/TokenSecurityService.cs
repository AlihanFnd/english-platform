using System.Collections.Concurrent;

namespace EnglishReadingPlatform.Services
{
    public class TokenSecurityService
    {
        // Blacklisted Token IDs (JTI or full token hash) -> Expiration time
        private readonly ConcurrentDictionary<string, DateTime> _revokedTokens = new();
        
        // UserId -> Timestamp after which all prior issued tokens are invalid (e.g. password change, force logout)
        private readonly ConcurrentDictionary<int, DateTime> _userRevokedTimestamps = new();

        // Rate limiting: Key (UserId or IP) -> List of recent request timestamps
        private readonly ConcurrentDictionary<string, ConcurrentQueue<DateTime>> _rateLimitWindow = new();

        public TokenSecurityService()
        {
            // Start cleanup task for expired tokens
            Task.Run(async () =>
            {
                while (true)
                {
                    await Task.Delay(TimeSpan.FromMinutes(10));
                    CleanupExpiredTokens();
                }
            });
        }

        public void RevokeToken(string tokenOrJti, DateTime expiresAt)
        {
            if (string.IsNullOrWhiteSpace(tokenOrJti)) return;
            _revokedTokens[tokenOrJti] = expiresAt;
        }

        public void RevokeAllUserTokens(int userId)
        {
            _userRevokedTimestamps[userId] = DateTime.UtcNow;
        }

        public bool IsTokenRevoked(string? tokenOrJti, int userId, DateTime issuedAtUtc)
        {
            if (!string.IsNullOrEmpty(tokenOrJti) && _revokedTokens.TryGetValue(tokenOrJti, out var exp))
            {
                if (DateTime.UtcNow <= exp)
                {
                    return true; // Token specifically blacklisted
                }
                _revokedTokens.TryRemove(tokenOrJti, out _);
            }

            if (_userRevokedTimestamps.TryGetValue(userId, out var revokedAfter))
            {
                // If token was issued before or exactly at the revocation timestamp, reject it
                if (issuedAtUtc <= revokedAfter.AddSeconds(2))
                {
                    return true;
                }
            }

            return false;
        }

        public bool IsRateLimitExceeded(string key, int maxRequestsPerMinute)
        {
            if (string.IsNullOrWhiteSpace(key)) return false;

            var queue = _rateLimitWindow.GetOrAdd(key, _ => new ConcurrentQueue<DateTime>());
            var now = DateTime.UtcNow;

            queue.Enqueue(now);

            // Remove timestamps older than 60 seconds
            while (queue.TryPeek(out var first) && (now - first).TotalSeconds > 60)
            {
                queue.TryDequeue(out _);
            }

            return queue.Count > maxRequestsPerMinute;
        }

        private void CleanupExpiredTokens()
        {
            var now = DateTime.UtcNow;
            foreach (var kvp in _revokedTokens)
            {
                if (kvp.Value < now)
                {
                    _revokedTokens.TryRemove(kvp.Key, out _);
                }
            }
        }
    }
}
