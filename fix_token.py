with open('frontend/src/hooks/useFlightStream.ts', 'r') as f:
    content = f.read()

bad_token_fetch_1 = """        let token = openSkyTokenRef.current?.token;
        if (!openSkyTokenRef.current || Date.now() > openSkyTokenRef.current.expires) {
          const tokenRes = await fetch('./api.php?action=opensky_token', {
            headers: { 'Cache-Control': 'no-cache' }
          });
          if (tokenRes.ok) {
            const tokenData = await tokenRes.json();
            if (tokenData.token) {
              token = tokenData.token;
              openSkyTokenRef.current = {
                token,
                expires: Date.now() + 50 * 60 * 1000
              };
            }
          }
        }"""

good_token_fetch = """        let token = '';
        if (settings.openSkyCredentials?.clientId && settings.openSkyCredentials?.clientSecret) {
          if (!openSkyTokenRef.current || Date.now() > openSkyTokenRef.current.expires) {
            const tokenRes = await fetch('./api.php?action=opensky_token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: `grant_type=client_credentials&client_id=${encodeURIComponent(settings.openSkyCredentials.clientId)}&client_secret=${encodeURIComponent(settings.openSkyCredentials.clientSecret)}`
            });
            if (tokenRes.ok) {
              const tokenData = await tokenRes.json();
              if (tokenData.access_token) {
                openSkyTokenRef.current = {
                  token: tokenData.access_token,
                  expires: Date.now() + (tokenData.expires_in - 30) * 1000
                };
              }
            }
          }
          if (openSkyTokenRef.current) token = openSkyTokenRef.current.token;
        }"""

content = content.replace(bad_token_fetch_1, good_token_fetch)

with open('frontend/src/hooks/useFlightStream.ts', 'w') as f:
    f.write(content)
