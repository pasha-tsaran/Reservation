"""Build the metre-scale skaters used by the spectator preview. Run in Blender -b."""
import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
mat = bpy.data.materials.new("Equipment finishes")
mat.use_nodes = True
surface = mat.node_tree.nodes.get("Principled BSDF")
surface.inputs["Roughness"].default_value = .53
paint = mat.node_tree.nodes.new("ShaderNodeVertexColor")
paint.layer_name = "Kit"
mat.node_tree.links.new(paint.outputs["Color"], surface.inputs["Base Color"])


def colour(code):
    rgb = [int(code[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c < .04045 else ((c+.055)/1.055)**2.4 for c in rgb) + (1,)


class Piece:
    def __init__(self):
        self.verts, self.faces, self.colors = [], [], []

    def loft(self, rings, finish):
        # Rings are wound in the same direction, including the small end caps.
        start, count = len(self.verts), len(rings[0])
        for ring in rings:
            self.verts.extend((x, -z, y) for x, y, z in ring)
        faces = [tuple(start+i for i in range(count))]
        for j in range(len(rings)-1):
            for i in range(count):
                a, b = start+j*count+i, start+j*count+(i+1)%count
                faces.append((a, a+count, b+count, b))
        faces.append(tuple(start+(len(rings)-1)*count+i for i in reversed(range(count))))
        self.faces.extend(faces)
        self.colors.extend([colour(finish)]*len(rings)*count)

    def shell(self, sections, finish, n=14):
        self.loft([[(x+w*math.cos(i*math.tau/n), y, z+d*math.sin(i*math.tau/n))
                    for i in range(n)] for x,y,z,w,d in sections], finish)

    def limb(self, start, end, r0, r1, finish, n=10, depth=1):
        a, b = Vector(start), Vector(end)
        axis = (b-a).normalized()
        across = axis.cross(Vector((0,0,1)) if abs(axis.z)<.9 else Vector((1,0,0))).normalized()
        other = across.cross(axis)
        self.loft([[p+r*math.cos(i*math.tau/n)*across+r*depth*math.sin(i*math.tau/n)*other
                    for i in range(n)] for p,r in [(a,r0*.83),(a.lerp(b,.13),r0),
                                                     (a.lerp(b,.82),r1),(b,r1*.86)]], finish)

    def finish(self, name):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.verts, [], self.faces)
        mesh.materials.append(mat)
        colors = mesh.color_attributes.new(name="Kit", type="FLOAT_COLOR", domain="POINT")
        for i, rgb in enumerate(self.colors):
            colors.data[i].color = rgb
        for f in mesh.polygons:
            f.use_smooth = len(f.vertices) == 4
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)


dark, rubber, steel, white = "162735", "172029", "b8d3dd", "ebf1ed"


def player(team, goalie):
    home = team == "Home"
    jersey, stripe, trim = ("137987", "e4ffff", "8adfda") if home else ("efebe0", "af382e", "d7583c")
    helmet = "123e4d" if home else "fcf4e3"
    prefix = team + ("_Goalie" if goalie else "_Skater")
    body = Piece()
    # Skates to crown in the bent-knee stance: 1.68 m. The goalie sits deeper.
    sink = .15 if goalie else 0
    def torso(sections, c):
        body.shell([(0,y-sink,z,w,d) for y,z,w,d in sections], c)
    torso([(.76,-.04,.19,.13),(.90,-.06,.217,.16),(1.01,-.03,.185,.13)], dark)
    torso([(.91,-.03,.225,.155),(1.00,-.006,.24,.16),(1.25,.07,.245,.162),
           (1.38,.105,.273,.152),(1.44,.11,.205,.118),(1.47,.12,.091,.08)], jersey)
    torso([(.955,-.021,.236,.161),(.99,-.009,.242,.163)], stripe)
    torso([(1.003,-.004,.243,.164),(1.018,.0,.244,.165)], trim)
    torso([(1.40,.11,.11,.10),(1.49,.13,.08,.078)], dark)
    torso([(1.43,.14,.065,.068),(1.49,.157,.090,.091),(1.58,.144,.096,.102),
           (1.63,.135,.084,.083)], "c98e69" if home else "a56c51")
    torso([(1.545,.137,.104,.109),(1.62,.13,.111,.117),(1.674,.117,.088,.095),
           (1.692,.116,.043,.049)], helmet)
    torso([(1.57,.188,.086,.064),(1.585,.177,.103,.084)], helmet)
    torso([(1.532,.211,.082,.037),(1.566,.211,.091,.04)], "71929b")
    # Stitched chest emblem. The away jersey has a vermilion double chevron.
    for sign in [-1,1]:
        body.limb((0,1.29-sink,.239),(sign*.062,1.24-sink,.23),.012,.008,stripe,6)
        if home:
            body.limb((0,1.31-sink,.235),(0,1.20-sink,.237),.012,.01,white,6)
    hands = []
    for sign in [-1,1]:
        shoulder=(sign*.225,1.367-sink,.10)
        elbow=(sign*(.36 if goalie else .30),1.16-sink,.16 if sign<0 else .10)
        glove=(sign*.42 if goalie else (.035 if sign<0 else .15), (1.09 if sign<0 else .88)-sink,
               .35 if sign<0 else .49)
        body.limb(shoulder,elbow,.124,.091,jersey)
        body.limb(Vector(shoulder).lerp(Vector(elbow),.72),elbow,.097,.094,stripe)
        body.limb(elbow,glove,.093,.064,jersey)
        body.limb(Vector(elbow).lerp(Vector(glove),.3),Vector(elbow).lerp(Vector(glove),.48),.091,.084,stripe)
        gx,gy,gz=glove
        body.shell([(gx,gy-.075,gz,.065,.071),(gx,gy+.008,gz,.088,.092),
                    (gx,gy+.073,gz-.02,.077,.074)],white if goalie else dark)
        hands.append(Vector(glove))
    high,low=hands
    if goalie:
        high=low+Vector((.035,.34,-.17))
    toe=low+(low-high)*((low.y-.034)/(high.y-low.y))
    if goalie:
        toe=Vector((low.x+.12,.035,low.z+.37))
    body.limb(high+(high-low).normalized()*.069,toe,.014,.013,rubber,6)
    body.limb(toe,toe+Vector((-.25,.018,.039)),.033,.026,rubber,6,.44)
    body.finish(prefix+"_Body")
    for sign,side in [(-1,"Left"),(1,"Right")]:
        leg=Piece()
        hip=Vector((sign*.119,.85-sink,-.045))
        knee=Vector((sign*(.26 if goalie else .162),.49-sink*.3,.135))
        ankle=Vector((sign*(.372 if goalie else .20),.17,-.115))
        leg.limb(hip,knee,.147,.109,dark)
        leg.limb(knee,ankle,.108,.065,white if goalie else jersey)
        for t1,t2,c in [(.19,.32,stripe),(.37,.42,trim)]:
            leg.limb(knee.lerp(ankle,t1),knee.lerp(ankle,t2),.111-t1*.045,.111-t2*.045,c)
        if goalie:
            leg.limb(ankle+Vector((0,-.048,.07)),knee+Vector((0,.13,.061)),.104,.137,white,8,.70)
        x,z=ankle.x,ankle.z
        leg.shell([(x,.071,z+.018,.059,.148),(x,.104,z+.02,.071,.16),
                   (x,.144,z+.014,.072,.145),(x,.208,z-.035,.063,.087)],rubber)
        leg.shell([(x,.019,z+.023,.009,.128),(x,.057,z+.025,.009,.144)],steel,12)
        for dz in [-.049,.088]:
            leg.limb((x,.045,z+dz),(x,.09,z+dz),.023,.027,white,8)
        leg.finish(prefix+"_"+side)


for team in ["Home","Away"]:
    for keeper in [False,True]:
        player(team,keeper)
bpy.ops.export_scene.gltf(filepath=str(ROOT/"public"/"arena"/"players.glb"), export_format="GLB",
                          export_yup=True, export_materials="EXPORT")
