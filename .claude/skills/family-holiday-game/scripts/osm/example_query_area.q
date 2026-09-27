[out:json][timeout:170];
(
 way["building"](around:2200,36.3725,-6.1855);
 relation["building"](around:2200,36.3725,-6.1855);
 way["landuse"~"forest|grass|residential|commercial|construction"](around:3500,36.3725,-6.1855);
 relation["landuse"="forest"](around:3500,36.3725,-6.1855);
 way["natural"~"wood|scrub|beach|sand|heath|water|wetland"](around:3500,36.3725,-6.1855);
 way["leisure"~"golf_course|park|pitch"](around:3500,36.3725,-6.1855);
 way["golf"~"fairway|green|bunker|tee"](around:3500,36.3725,-6.1855);
 way["highway"~"primary|secondary|tertiary|residential|unclassified|living_street|footway|pedestrian"](around:1500,36.3725,-6.1855);
);
out geom tags;
