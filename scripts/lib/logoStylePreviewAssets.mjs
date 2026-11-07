// Source artwork for the Logo Studio style selector. No I/O or paid generation.
export function createLogoStylePreviewAssets() {
  const ink='#18232B',cream='#F6E7C8',gold='#EEB858',teal='#70D2BA',lavender='#BDA7F4',coral='#EF806A';
  const wrap=(name,body)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><title>${name}</title>${body}</svg>`;
  const path=(d,fill,extra='')=>`<path d="${d}" fill="${fill}" ${extra}/>`;
  const stroke=(d,color,width=3,extra='')=>path(d,'none',`stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}`);
  const circle=(x,y,r,fill,extra='')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
  const assets={};

  assets.minimalist=wrap('Split leaf negative-space mark',
   path('M24 104C4 60 51 15 104 24 60 29 38 60 24 104Z',cream)+
   path('M34 104C52 78 70 56 104 24 118 71 83 118 34 104Z',cream));

  assets.mascot=wrap('Saber tiger mascot',
   path('M23 18 43 28 64 18 86 28 106 17 109 48 119 69 104 99 65 119 24 99 9 69 20 47Z',cream)+
   path('M26 24 45 34 64 25 83 34 102 24 100 52 110 69 98 93 65 111 31 93 18 69 28 49Z',ink)+
   path('M30 32 43 39 29 48Z',coral)+path('M85 39 98 32 98 49Z',coral)+
   path('M47 35 64 28 81 36 75 53 64 45 53 53Z',gold)+
   path('M27 56 46 44 54 58 46 68 32 64Z',gold)+path('M82 44 101 56 96 65 81 68 74 58Z',gold)+
   path('M31 57 50 57 43 63 35 62Z',cream)+path('M78 57 97 57 93 62 85 63Z',cream)+
   path('M34 70 49 70 57 80 64 75 72 80 81 70 96 70 88 89 75 96 64 90 53 96 40 89Z',cream)+
   path('M53 70 75 70 68 78 61 78Z',coral)+path('M47 84 58 89 55 105 50 96Z',gold)+path('M70 89 81 84 78 98 73 105Z',gold)+
   path('M25 67 36 74 30 80 40 87 30 86 23 75Z',gold)+path('M103 67 92 74 98 80 88 87 98 86 105 75Z',gold)+
   path('M60 34 64 48 68 34Z',ink)+path('M48 37 56 39 52 49Z',ink)+path('M72 39 80 37 76 49Z',ink));

  assets.retro=wrap('Strike matchbox retro character',
   stroke('M32 69Q13 59 15 42M96 69Q114 59 113 45',cream,6)+
   path('M12 39Q6 30 10 27 15 24 19 35L19 24Q22 19 25 24L26 38 31 33Q37 33 34 39L25 49 15 47Z',cream,`stroke="${ink}" stroke-width="2"`)+
   path('M109 44 106 33Q107 28 111 31L116 38 119 30Q124 29 124 34L120 48Z',cream,`stroke="${ink}" stroke-width="2"`)+
   stroke('M49 94 47 111M76 94 79 111',cream,7)+
   path('M30 108Q48 101 53 110L53 117 26 117Q21 114 30 108ZM72 109Q81 102 94 110L99 117 72 117Z',cream,`stroke="${ink}" stroke-width="3"`)+
   path('M31 33 83 26 98 37 98 96 43 104 31 95Z',ink,`stroke="${cream}" stroke-width="2"`)+
   path('M34 36 84 30 84 88 34 96Z',coral)+path('M87 32 95 39 95 92 87 88Z',gold)+
   path('M49 33Q39 19 56 7 53 20 63 23 66 15 65 11 84 23 70 33Z',gold)+
   path('M54 31Q49 24 56 19 55 26 63 28 66 24 66 22 72 28 65 32Z',cream)+
   `<ellipse cx="49" cy="59" rx="5" ry="10" fill="${ink}"/><ellipse cx="68" cy="56" rx="5" ry="10" fill="${ink}"/>`+
   stroke('M44 75Q58 88 74 69',ink,3)+stroke('M45 75Q59 80 70 73',cream,3)+stroke('M37 89 79 83',cream,2)+
   stroke('M89 45 93 49M89 55 93 59M89 65 93 69M89 75 93 79',ink,2));

  assets.badge=wrap('Nightflight moth crest',
   path('M15 20 64 9 113 20 109 76Q102 101 64 120 27 102 19 76Z',ink,`stroke="${teal}" stroke-width="3"`)+
   path('M23 27 64 17 105 27 101 74Q94 95 64 111 35 95 27 74Z','none',`stroke="${cream}" stroke-width="1.5"`)+
   circle(64,38,13,gold)+path('M70 24Q51 31 62 49 45 43 51 31 57 23 70 24Z',cream)+
   path('M62 58 29 43 34 73 56 89 62 76 64 99 67 76 73 89 95 73 99 43 67 58 64 53Z',teal)+
   path('M37 54 57 64 51 75 39 68ZM91 54 71 64 77 75 89 68Z',ink)+
   stroke('M61 56 56 49M67 56 72 49',cream,2)+path('m64 32 2 5 5 1-5 2-2 5-2-5-5-2 5-1Z',ink)+
   stroke('M36 94 49 101M79 101 92 94',gold,2));

  assets.monogram=wrap('Interlocked AV serif monogram',
   path('M22 101 53 22H64L94 101H105V106H75V101H83L75 80H43L35 101H46V106H13V101ZM46 72H72L59 38Z',cream,'fill-rule="evenodd"')+
   path('M51 24H82V29H73L90 75 107 29H98V24H121V29H115L91 94H81L57 29H51Z',gold)+
   path('M69 58 76 76 71 88 64 69Z',ink)+
   path('M41 73H74V79H41Z',cream));

  assets.wordmark=wrap('Nivo custom rounded wordmark',
   path('M8 88V55H18V59Q22 53 29 54 40 54 40 67V88H30V68Q30 62 25 62 18 62 18 69V88Z',cream)+
   path('M46 55H56V88H46Z',cream)+circle(51,43,5,lavender)+
   path('M61 55H72L80 77 88 55H99L85 88H75Z',cream)+
   path('M111 54C130 54 132 89 112 89 92 89 92 54 111 54ZM112 63C103 63 104 80 112 80 120 80 121 63 112 63Z',cream,'fill-rule="evenodd"'));

  assets.line=wrap('Continuous leaping panther contour',
   stroke('M16 86Q5 88 10 78 16 69 24 62L38 43Q47 33 61 35L80 39 87 30 90 18 99 26 109 25 116 36 107 45 96 46 86 59 72 64 62 83 72 92 63 97 50 85 54 68 45 70 35 91 25 96 19 92 28 83 33 67',cream,3.2)+
   stroke('M57 39Q40 16 24 21 6 28 15 42 21 50 27 43 31 38 27 36',teal,3.2)+
   stroke('M91 46 100 34 107 34M40 56 56 51 71 53M74 65 84 74 99 71 105 77 84 84 70 77M51 97 64 105',cream,2.5)+
   circle(103,31,1.7,gold));

  assets.abstract=wrap('Interlocking current abstract mark',
   path('M16 67C14 41 36 20 61 20 84 20 101 38 100 58 99 72 90 82 78 86 90 70 88 50 75 40 59 28 35 35 29 52 25 63 28 76 37 84L27 97C20 90 16 79 16 67Z',coral)+
   path('M112 61C114 87 92 108 67 108 44 108 27 90 28 70 29 56 38 46 50 42 38 58 40 78 53 88 69 100 93 93 99 76 103 65 100 52 91 44L101 31C108 38 112 49 112 61Z',cream));

  let shell=path('M28 103Q5 74 29 39 48 13 79 22 113 31 111 65 110 94 79 105 51 115 28 103Z',ink,`stroke="${gold}" stroke-width="2.5"`);
  shell+=stroke('M36 97Q18 74 37 48 51 30 73 36 96 42 96 64 95 82 77 88 60 94 50 81 40 69 50 56 58 47 70 51 82 56 78 68 74 78 64 73 60 69 64 64',cream,2.5);
  for(let i=0;i<13;i++){const a=(-145+i*20)*Math.PI/180;const x=68+43*Math.cos(a),y=65+43*Math.sin(a),ix=66+28*Math.cos(a+.14),iy=65+28*Math.sin(a+.14);shell+=stroke(`M${x.toFixed(1)} ${y.toFixed(1)}Q${((x+ix)/2+3).toFixed(1)} ${((y+iy)/2-2).toFixed(1)} ${ix.toFixed(1)} ${iy.toFixed(1)}`,gold,1.1);}
  shell+=stroke('M27 98 14 108 38 106M31 101 26 111 50 107M79 106 94 113',cream,1.7);
  assets.engraved=wrap('Etched nautilus shell',shell);

  assets.icon=wrap('Friendly ringed-planet icon',
   circle(64,60,34,gold)+path('M43 37Q27 58 43 81 26 73 30 53 34 41 43 37Z',coral)+
   `<ellipse cx="64" cy="70" rx="54" ry="16" transform="rotate(-25 64 70)" fill="none" stroke="${teal}" stroke-width="9"/>`+
   path('M32 43Q58 17 85 36L94 62Q67 78 38 65Z',gold)+
   circle(54,56,3.2,ink)+circle(76,51,3.2,ink)+stroke('M59 66Q68 71 75 61',ink,3)+
   path('m103 15 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z',cream)+circle(18,99,4,lavender)+circle(101,99,2,cream));

  assets.cartoon=wrap('Space courier cat character',
   path('M43 81 34 110 49 112 58 91 72 91 80 112 95 109 84 81Z',lavender,`stroke="${ink}" stroke-width="3"`)+
   path('M39 78 27 90 19 83 17 71 23 68 28 78 34 65M91 70 102 76 108 63 115 65 111 86 100 92 86 81',cream,`stroke="${ink}" stroke-width="3" stroke-linejoin="round"`)+
   circle(64,49,38,teal,`stroke="${cream}" stroke-width="3"`)+
   path('M37 44 40 21 55 32 72 32 88 21 91 45 86 67Q64 83 42 67Z',coral,`stroke="${ink}" stroke-width="3" stroke-linejoin="round"`)+
   path('M44 29 46 41 52 35M77 35 84 29 84 41',cream)+
   path('M43 58Q64 43 86 58L83 67Q65 79 46 67Z',cream)+
   circle(51,49,3,ink)+circle(77,49,3,ink)+path('m60 57 8 0-4 5Z',ink)+stroke('M55 65Q61 69 64 63 68 69 73 64',ink,2)+
   stroke('M39 24Q55 13 72 16',cream,3)+
   path('M42 79 85 79 89 94 39 94Z',cream,`stroke="${ink}" stroke-width="3"`)+
   path('M54 82 73 82 73 92 54 92Z',lavender)+circle(78,87,2,coral)+
   path('M32 110 50 110 50 119 27 119Q24 115 32 110ZM79 110 96 110Q104 115 101 119L79 119Z',cream,`stroke="${ink}" stroke-width="3"`));


  return assets;
}
