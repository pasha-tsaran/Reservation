"""Build the editable Polaris bowl and its matching browser geometry and seat manifest.
Run Blender in background with --python model/build_arena.py from the project root.
Dimensions and all camera anchors use metres. Browser coordinates are X, up, Z.
"""
import bpy
import json
import math
from bisect import bisect_left
import sys
from collections import defaultdict
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"model"))
import seating
ASSETS = ROOT / "public" / "arena"
ASSETS.mkdir(exist_ok=True, parents=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
palette = {
    "Slab": "#283644", "Riser": "#425365", "Aisle": "#738394", "Nosing": "#949fa7",
    "Foundation": "#1b2935", "Facade": "#304353", "Frame": "#658198",
    "Rail": "#a6bbc5", "Glass": "#a4dbdf", "Board": "#e4eced",
    "Kickplate": "#f1aa32", "Cap": "#d14148", "LED": "#5cc7c0",
    "Screen": "#132934", "Goal": "#e7404a", "Net": "#acb9bb",
    "Suite": "#886245", "Warm": "#ffc98b", "Lamp": "#d2eff4",
    "SuiteTrim": "#efc747", "Team": "#45a56b", "Chair": "#22668a", "Support": "#526474", "Recess": "#101b24",
    "Timber": "#9b7453", "Upholstery": "#315262", "Door": "#293f4c"
}
parts = defaultdict(lambda: [[], []])

def xyz(p):
    return (p[0], -p[2], p[1])

def face(key, pts):
    verts, faces = parts[key]
    start = len(verts)
    verts.extend(xyz(p) for p in pts)
    faces.append(tuple(range(start, start + len(pts))))

def box(key, x,y,z, w,h,d):
    p = [(x+u*w/2,y+v*h/2,z+t*d/2) for u,v,t in
         [(-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1),(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]]
    for ids in [(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]:
        face(key,[p[i] for i in ids])

def rod(key,a,b,r=0.07, sides=5):
    a,b=Vector(a),Vector(b)
    axis=(b-a).normalized()
    side=axis.cross(Vector((0,1,0)) if abs(axis.y)<0.90 else Vector((1,0,0))).normalized()
    other=axis.cross(side)
    pts=[(side*math.cos(i*2*math.pi/sides)+other*math.sin(i*2*math.pi/sides))*r for i in range(sides)]
    for i in range(sides):
        j=(i+1)%sides
        face(key,[a+pts[i],a+pts[j],b+pts[j],b+pts[i]])

# Rounded rectangle at equal distances along the base path. Offset curves share normals.
A,B,R=30,15,8.5
L,W,Q=2*(A-R),2*(B-R),math.pi*R/2
lengths=[L,Q,W,Q,L,Q,W,Q]
def outline(t,offset=0):
    rem=(t%1)*sum(lengths)
    seg=0
    while seg<7 and rem>lengths[seg]:
        rem-=lengths[seg]
        seg+=1
    s=rem/lengths[seg]
    if seg in [0,2,4,6]:
        x,z,nx,nz=[(-A+R+L*s,-B,0,-1),(A,-B+R+W*s,1,0),
                    (A-R-L*s,B,0,1),(-A,B-R-W*s,-1,0)][seg//2]
    else:
        cx,cz=[(A-R,-B+R),(A-R,B-R),(-A+R,B-R),(-A+R,-B+R)][seg//2]
        ang=-math.pi/2+seg//2*math.pi/2+s*math.pi/2
        nx,nz=math.cos(ang),math.sin(ang)
        x,z=cx+R*nx,cz+R*nz
    return x+offset*nx,z+offset*nz,nx,nz

def point(t,d,h):
    x,z,_,_=outline(t,d)
    return (x,h,z)

def band(key,t0,t1,d0,h0,d1,h1,segments=36):
    for i in range(segments):
        a=t0+(t1-t0)*i/segments
        b=t0+(t1-t0)*(i+1)/segments
        face(key,[point(a,d0,h0),point(a,d1,h1),point(b,d1,h1),point(b,d0,h0)])

def ring(key,d0,h0,d1,h1):
    band(key,0,1,d0,h0,d1,h1,128)

def level(row):
    return 2.65+(row-1)*.96, .45+(row-1)*.52

def aisle_center(index):
    # Give the two end stands enough width for their existing wider curved rows.
    shift={4:-.009,5:.009,10:-.009,11:.009}.get(index,0)
    return index/12+shift

def row_positions(start,end,offset,count,pitch):
    # Offset curves are longer around corners. Measure the physical arc instead
    # of spacing chairs by the parameter of the smaller ice perimeter.
    ts=[start+(end-start)*i/128 for i in range(129)]
    points=[outline(t,offset)[:2] for t in ts]
    arc=[0.0]
    for a,b in zip(points,points[1:]):
        arc.append(arc[-1]+math.dist(a,b))
    step=min(pitch,arc[-1]/(count-1))
    breaks=(count-1)//8
    gap=min(1.10,(arc[-1]-step*(count-1))/max(1,breaks))
    margin=(arc[-1]-step*(count-1)-gap*breaks)/2
    for i in range(count):
        distance=margin+i*step+(i//8)*gap
        j=min(128,max(1,bisect_left(arc,distance)))
        yield ts[j-1]+(ts[j]-ts[j-1])*(distance-arc[j-1])/(arc[j]-arc[j-1])

# The concourse starts directly behind row nine.
ring("Foundation",-.02,-1.5,14.4,-1.5)
ring("Facade",14.4,-1.5,14.4,5.47)
ring("Foundation",14.50,0,14.50,.26)
ring("Riser",11.1,4.08,11.1,4.65)
ring("Slab",11.08,4.65,14.4,4.65)
ring("Facade",14.36,4.65,14.36,5.47)
ring("Frame",14.43,5.47,14.30,5.52)
ring("LED",14.42,4.37,14.42,4.44)
ring("Slab",0.14,0.02,3.0,0.02)
ring("Board",0.0,0.02,0,1.12)
ring("Board",0.16,0.02,0.16,1.13)
ring("Cap",0,1.14,0.17,1.14)
ring("Kickplate",-0.025,0.04,-0.025,0.22)
ring("Glass",0.08,1.15,0.08,2.65)
ring("Rail",0.08,2.64,0.08,2.67)
for i in range(94):
    rod("Frame",point(i/94,0.09,1.1),point(i/94,0.09,2.68),0.035)

# First-tier risers and stair aisles.
for row in range(1,10):
    d,h=level(row)
    ring("Slab",d-0.15,h,d+0.81,h)
    ring("Riser",d-0.15,h-0.53,d-0.15,h)
    for aisle in range(12):
        t=aisle_center(aisle)
        band("Aisle",t-.0035,t+.0035,d-0.16,h+.025,d+.32,h+.025,4)
        band("Nosing",t-.0035,t+.0035,d-.16,h+.03,d-.08,h+.03,4)
        band("Aisle",t-.0035,t+.0035,d+.32,h+.27,d+.81,h+.27,4)
        if row in (3,6):
            rod("Rail",point(t,d,h+.1),point(t,d,h+1.28),.055)
            rod("Rail",point(t,d,h+1.28),point(t,d+1.80,h+2.18),.065)
            rod("Rail",point(t,d+1.80,h+1.25),point(t,d+1.80,h+2.18),.055)
for i in range(80):
    t=i/80
    rod("Frame",point(t,14.45,-1.42),point(t,14.45,5.44),.08)
    if i%2==0:
        band("Lamp",t+.001,t+.009,13.84,4.68,14.0,4.68,2)

# Four distinct, empty rooms behind each long stand. All walls follow the straight boards.
suites=[]
for side in (0,1):
    zsign=-1 if side==0 else 1
    for i in range(4):
        x=(i-1.5)*10.5
        number=201+4*side+i
        suites.append((x,zsign,number))
        z=29.05*zsign
        box("Suite",x,4.78,z,10.4,.30,4.85)
        box("Timber",x,6.46,z+2.33*zsign,10.4,3.10,.18)
        for offset in (-5.13,5.13):
            box("Facade",x+offset,6.46,z,.14,3.12,4.85)
        box("Slab",x,8.10,z,10.46,.21,4.94)
        box("SuiteTrim",x,8.213,z-2.17*zsign,10.25,.015,.34)
        box("Warm",x,7.94,z-2.41*zsign,10.30,.12,.10)
        box("SuiteTrim",x,4.92,z-2.44*zsign,10.30,.28,.11)
        box("Glass",x,5.55,z-2.38*zsign,10.19,1.05,.055)
        box("Rail",x,6.08,z-2.38*zsign,10.20,.045,.07)
        box("Door",x+2.9,5.99,z+2.20*zsign,1.04,2.16,.04)
        for dx in (-5,0,5):
            box("Frame",x+dx,6.47,z-2.37*zsign,.055,3.02,.065)
        for j in range(16):
            box("Suite",x-4.85+j*.64,6.44,z+2.21*zsign,.037,2.99,.035)

# Goals and nets.
for sign in (-1,1):
    x=sign*26
    for z in (-.92,.92):
        rod("Goal",(x,.04,z),(x,1.24,z),.048,8)
        rod("Goal",(x,1.24,z),(x+sign*.78,1.02,z*.88),.038)
        rod("Goal",(x,.04,z),(x+sign*1.03,.04,z*.93),.04)
    rod("Goal",(x,1.24,-.92),(x,1.24,.92),.052,8)
    for i in range(17):
        z=-.85+i*.106
        rod("Net",(x+sign*.78,1.02,z*.94),(x+sign*1.04,.05,z),.012,4)
    for j in range(8):
        y=.06+j*.137
        rod("Net",(x+sign*(1.04-y*.24),y,-.83),(x+sign*(1.04-y*.24),y,.83),.012,4)
# Benches occupy the central gap in the first two rows of sections 102 and 108.
for sign in (-1,1):
    for row in (1,2):
        d,h=level(row)
        z=sign*(15+d+.31)
        center_x=sign*.824
        box("Team",center_x,h+.50,z,8.4,.13,.48)
        box("Team",center_x,h+.72,z+sign*.21,8.4,.40,.09)
        for dx in (-3.5,0,3.5):
            box("Frame",center_x+dx,h+.22,z,.12,.45,.37)

def material(name):
    obj=bpy.data.materials.new(name)
    col=palette[name].lstrip("#")
    def linear(v):
        x=int(v,16)/255
        return x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4
    rgb=tuple(linear(col[i:i+2]) for i in (0,2,4))
    obj.diffuse_color=(*rgb,1)
    obj.use_nodes=True
    bs=next(n for n in obj.node_tree.nodes if n.type=="BSDF_PRINCIPLED")
    bs.inputs["Base Color"].default_value=(*rgb,1)
    bs.inputs["Roughness"].default_value=.58
    if name=="Glass":
        bs.inputs["Alpha"].default_value=.16
        obj.diffuse_color=(*rgb,.16)
    if name in ["LED","Lamp","Warm"]:
        bs.inputs["Emission Color"].default_value=(*rgb,1)
        bs.inputs["Emission Strength"].default_value=.8
    obj.use_backface_culling=False
    return obj

materials={k:material(k) for k in palette}
def mesh_obj(name,verts,faces,mat):
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(materials[mat])
    return obj

for key,(verts,faces) in parts.items():
    mesh_obj(key,verts,faces,key)
bpy.ops.export_scene.gltf(filepath=str(ASSETS/"bowl.glb"),export_format="GLB",export_yup=True,export_texcoords=False,export_tangents=False,export_cameras=False)

sectors=[]
seats=[]
def rounded(v):
    return round(v,3)
def add_seat(sector,row,num,t,d,h):
    x,z,nx,nz=outline(t,d)
    yaw=math.atan2(nx,nz)
    seats.append([sector,row,num,rounded(x),rounded(h),rounded(z),rounded(yaw)])

for i in range(12):
    sector=101+i
    t=(i+.5)/12
    x,z,nx,nz=outline(t,7)
    base=1200 if abs(nx)>.85 else (1800 if abs(nx)>.15 else 2400)
    side="За воротами" if abs(nx)>.85 else ("Угловая трибуна" if abs(nx)>.15 else "Боковая трибуна")
    sectors.append(dict(id=sector,title=side,base=base,anchor=[rounded(x),2.65,rounded(z)],normal=[rounded(nx),rounded(nz)]))
    for row in range(1,10):
        d,h=level(row)
        count=22+((row-1)//3)*2 if abs(nx)>.15 else 23
        positions=row_positions(aisle_center(i)+.0055,aisle_center(i+1)-.0055,d+.31,count,
                                .535 if abs(nx)>.15 else .505)
        for n,t in enumerate(positions,1):
            if sector in (102,108) and row <= 2 and 4 <= n <= 20:
                continue
            add_seat(sector,row,n,t,d+.31,h)
for x,sign,number in suites:
    sectors.append(dict(id=number,title="VIP-комната",base=6500,
                        anchor=[x,5.05,sign*29.05],normal=[0,sign],
                        surface=[[[round(x-5.2+10.4*j/16,3),8.23,round(sign*z,3)]
                                  for j in range(17)] for z in (26.58,31.52)]))
for i,sec in enumerate(sectors[:12]):
    start,end=aisle_center(i)+.00375,aisle_center(i+1)-.00375
    sec["surface"]=[[[rounded(v) for v in point(start+(end-start)*j/16,d,h)] for j in range(17)]
                    for d,h in [(2.52,1.08),(11.12,5.28)]]
(ASSETS/"layout.json").write_text(json.dumps({"sectors":sectors,"seats":seats},ensure_ascii=False,separators=(",",":")),encoding="utf8")
prototypes=seating.masters(ASSETS/"seating.glb")
meshes={}
masters=[]
for (kind,detail),objects in prototypes.items():
    if detail=="Far":
        for obj in objects:bpy.data.objects.remove(obj,do_unlink=True)
        continue
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    master=bpy.context.object
    master.name=kind+" | seat master"
    meshes[kind]=master.data
    masters.append(master)
collection=bpy.data.collections.new("Seat layout")
bpy.context.scene.collection.children.link(collection)
for sec,row,num,x,h,z,yaw in seats:
    obj=bpy.data.objects.new(f"{sec}-{row:02}-{num:02}",meshes["Club" if sec>=200 else "Stand"])
    collection.objects.link(obj)
    obj.location=xyz((x,h,z))
    obj.rotation_euler.z=yaw
for master in masters:bpy.data.objects.remove(master,do_unlink=True)
seating.number_plates(seats,collection)
ice_points=[point(i/256,-.02,.027) for i in range(256)]
ice=mesh_obj("Rink | match markings",[xyz(p) for p in ice_points],[tuple(reversed(range(256)))],"Board")
ice_material=materials["Board"].copy()
ice_material.name="Ice | Polaris"
ice.data.materials[0]=ice_material
texfile=ASSETS/"ice.webp"
if texfile.exists():
    mapping=ice.data.uv_layers.new(name="Rink markings")
    for loop in ice.data.loops:
        v=ice.data.vertices[loop.vertex_index].co
        mapping.data[loop.index].uv=(v.x/60+.5,v.y/30+.5)
    image=bpy.data.images.load(str(texfile))
    image.pack()
    tree=ice_material.node_tree
    tex=tree.nodes.new("ShaderNodeTexImage")
    tex.image=image
    bs=next(n for n in tree.nodes if n.type=="BSDF_PRINCIPLED")
    tree.links.new(tex.outputs["Color"],bs.inputs["Base Color"])

scene=bpy.context.scene
scene.world=bpy.data.worlds.new("Arena ambient")
scene.world.color=(.2,.26,.32)
target=Vector((0,0,4))
position=Vector((35,-100,104))
rotation=(target-position).to_track_quat('-Z','Y')
cam_data=bpy.data.cameras.new("Arena overview")
cam=bpy.data.objects.new("Arena overview",cam_data)
scene.collection.objects.link(cam)
cam.location=position
cam.rotation_euler=rotation.to_euler()
cam.data.lens=37
scene.camera=cam
sun_data=bpy.data.lights.new("Arena daylight","SUN")
sun_data.energy=3.0
sun_data.angle=math.radians(15)
sun=bpy.data.objects.new("Arena daylight",sun_data)
scene.collection.objects.link(sun)
sun.rotation_euler=(.48,-.62,-.3)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=="VIEW_3D":
            space=area.spaces.active
            space.region_3d.view_distance=143
            space.region_3d.view_location=target
            space.region_3d.view_rotation=rotation
            space.shading.color_type="MATERIAL"
            space.overlay.show_overlays=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/"model"/"Polaris.blend"),compress=True)
print(f"Polaris: {len(sectors)} sectors, {len(seats)} seats")

