export type ExplorerEntry = {
	id: number;
	name: string;
	mode: string;
	texPath: string;
	x: number;
	y: number;
	s: number;
};

// Grid position (tl t tr / l c r / bl b br) → alignment index a
// a: 0=c 1=t 2=b 3=l 4=r 5=tl 6=tr 7=bl 8=br
const GRID_POS_TO_A = [5, 1, 6, 3, 0, 4, 7, 2, 8];
const GRID_LABELS = ["tl", "t", "tr", "l", "c", "r", "bl", "b", "br"];

export function buildExplorerHtml(entries: ExplorerEntry[]): string {
	const dataJson = JSON.stringify(entries);
	const posToA = JSON.stringify(GRID_POS_TO_A);
	const labels = JSON.stringify(GRID_LABELS);

	const script = `
const DECALS=${dataJson};
const ALIGN_A=${posToA};
const ALIGN_LBL=${labels};

// Global alignment state + subscriber list
var currentA=0;
var subscribers=[];

function alignOffsets(a){
  // unit alignment directions (scale-independent)
  var v=[
    [0,0],    // c
    [0,-8],   // t
    [0,8],    // b
    [-8,0],    // l
    [8,0],   // r
    [-8,-8],   // tl
    [8,-8],  // tr
    [-8,8],    // bl
    [8,8],   // br
  ];
  return v[a]||[0,0];
}

// Build the floating alignment panel
function buildFloating(){
  var box=document.createElement('div');
  box.id='align-box';
  box.innerHTML='<b>Alignment</b>';

  var grid=document.createElement('div');
  grid.className='align-grid';

  for(var pos=0;pos<9;pos++){
    (function(pos){
      var a=ALIGN_A[pos];
      var btn=document.createElement('button');
      btn.dataset.a=String(a);
      btn.textContent=ALIGN_LBL[pos];
      btn.title='a='+a;
      btn.addEventListener('click',function(){
        currentA=a;
        // update button highlight
        grid.querySelectorAll('button').forEach(function(b){b.classList.remove('active');});
        btn.classList.add('active');
        // fire all subscribers
        subscribers.forEach(function(fn){fn(a);});
      });
      grid.appendChild(btn);
    })(pos);
  }
  // set center active by default
  grid.querySelector('[data-a="0"]').classList.add('active');

  box.appendChild(grid);

  // drag-to-move
  var dragging=false, ox=0, oy=0;
  box.addEventListener('mousedown',function(e){
    if(e.target.tagName==='BUTTON') return;
    dragging=true; ox=e.clientX-box.offsetLeft; oy=e.clientY-box.offsetTop;
    e.preventDefault();
  });
  document.addEventListener('mousemove',function(e){
    if(!dragging) return;
    box.style.left=(e.clientX-ox)+'px';
    box.style.top=(e.clientY-oy)+'px';
  });
  document.addEventListener('mouseup',function(){dragging=false;});

  document.body.appendChild(box);
}

function makeCard(d){
  var wrap=document.createElement('div');
  wrap.className='expl_i';

  var title=document.createElement('b');
  title.textContent=d.id+' '+d.name+' '+d.mode;

  var baseCmd=document.createElement('span');
  baseCmd.className='ip';
  baseCmd.textContent='minecraft:give @p paper[custom_model_data='+d.id+']';

  var cmd=document.createElement('span');
  cmd.className='ip';

  var bg=document.createElement('div');
  bg.className='expl_bg';
  bg.addEventListener('mousemove',function(e){
    var r=bg.getBoundingClientRect();
    var cx=(e.clientX-r.left)/r.width-0.5;
    bg.style.transform='perspective(50mm) rotateY('+(cx*20)+'deg)';
  });
  bg.addEventListener('mouseleave',function(){bg.style.transform='none';});

  var img=document.createElement('img');
  img.src=d.texPath;
  img.alt=d.name;
  bg.appendChild(img);

  function applyAlign(a){
    var s=d.s;
    var off=alignOffsets(a);
    var dx=off[0], dy=off[1];
    var sz=s*128;
    img.style.width=sz+'px';
    img.style.height=sz+'px';
    var cx=192 - sz/2 - d.x*128 + dx*8;
    var cy=192 - sz/2 - d.y*128 + dy*8;
    img.style.left=cx+'px';
    img.style.top=cy+'px';
    cmd.textContent='minecraft:give @p paper[custom_model_data={floats:['+(d.id + a/10)+']}]';
  }

  subscribers.push(applyAlign);
  applyAlign(currentA);

  wrap.appendChild(title);
  wrap.appendChild(baseCmd);
  wrap.appendChild(cmd);
  wrap.appendChild(bg);
  return wrap;
}

buildFloating();
var container=document.querySelector('.expl_gr');
DECALS.forEach(function(d){ container.appendChild(makeCard(d)); });
`;

	const header = `<h1>Team Fuho's decal explorer</h1><br>
Invisible item_frame: <span class=ip>minecraft:give @p item_frame{EntityTag:{Invisible:1}}</span><br>
<span class=ip>minecraft:give @p item_frame[entity_data={id:"minecraft:item_frame",Invisible:true}] 1</span>`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Team Fuho Decal Explorer</title>
<link rel="stylesheet" href="explore.css">
</head>
<body>
${header}
<div class="expl_gr"></div>
<script>${script}</script>
</body>
</html>`;
}
