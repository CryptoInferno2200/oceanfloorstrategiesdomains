// Keep the URL hash: Netlify Identity email links (confirmation, recovery,
// invite, email change) carry their token there, and home.html processes it.
location.replace("home.html" + location.search + location.hash);
