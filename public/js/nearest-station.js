(function(root) {
  const radians = n => n * Math.PI / 180;
  function valid(lat,lng) {
    if(!['string','number'].includes(typeof lat) || !['string','number'].includes(typeof lng) || String(lat).trim()==='' || String(lng).trim()==='') return false;
    return lat !== null && lat !== '' && lat !== undefined && lng !== null && lng !== '' && lng !== undefined && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;
  }
  function distance(lat,lng,a,b) {
    const dlat=radians(a-lat), dlng=radians(b-lng);
    const h=Math.sin(dlat/2)**2+Math.cos(radians(lat))*Math.cos(radians(a))*Math.sin(dlng/2)**2;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
  }
  function eligible(stations) {
    const active=stations.filter(s=>Number(s.active)===1 && valid(s.lat,s.lng));
    const real=active.filter(s=>!Number(s.isDemo));
    return real.length ? real : active;
  }
  function nearest(stations,lat,lng) {
    if(!valid(lat,lng)) return null;
    return eligible(stations).map(s=>({...s,distanceKm:distance(Number(lat),Number(lng),Number(s.lat),Number(s.lng))}))
      .sort((a,b)=>a.distanceKm-b.distanceKm || a.id-b.id)[0] || null;
  }
  const api={valid,distance,eligible,nearest};
  if(typeof module !== 'undefined' && module.exports) module.exports=api;
  else root.RescueStations=api;
})(typeof window !== 'undefined' ? window : globalThis);
