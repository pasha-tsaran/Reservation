"""Instanced stadium furniture, in metres. Coordinates are (width, height, depth)."""
import math
import bpy
import bmesh
from mathutils import Vector, Euler


def linear(hexcode):
    vals=[int(hexcode[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in vals)


def finish(name, color, roughness, metallic=0, grain=0):
    mat=bpy.data.materials.new(name)
    rgb=linear(color)
    mat.diffuse_color=(*rgb,1)
    mat.use_nodes=True
    tree=mat.node_tree
    bs=next(n for n in tree.nodes if n.type=="BSDF_PRINCIPLED")
    bs.inputs["Base Color"].default_value=(*rgb,1)
    bs.inputs["Roughness"].default_value=roughness
    bs.inputs["Metallic"].default_value=metallic
    if grain:
        noise=tree.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value=grain
        noise.inputs["Detail"].default_value=2.2
        bump=tree.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value=.20
        bump.inputs["Distance"].default_value=.0009
        tree.links.new(noise.outputs["Fac"],bump.inputs["Height"])
        tree.links.new(bump.outputs["Normal"],bs.inputs["Normal"])
        if name.startswith("Saddle"):
            texcoords=tree.nodes.new("ShaderNodeTexCoord")
            tree.links.new(texcoords.outputs["Object"],noise.inputs["Vector"])
            ramp=tree.nodes.new("ShaderNodeValToRGB")
            ramp.color_ramp.elements[0].color=(.30,.30,.30,1)
            ramp.color_ramp.elements[1].color=(.55,.55,.55,1)
            tree.links.new(noise.outputs["Fac"],ramp.inputs["Fac"])
            tree.links.new(ramp.outputs["Color"],bs.inputs["Roughness"])
    return mat


class Surface:
    def __init__(self):
        self.verts=[]
        self.faces=[]

    def rows(self, rings, wrap=True, cap=True):
        start=len(self.verts)
        n=len(rings[0])
        for ring in rings:
            self.verts.extend((x,-z,y) for x,y,z in ring)
        for j in range(len(rings)-1):
            for i in range(n if wrap else n-1):
                a=start+j*n+i
                b=start+j*n+(i+1)%n
                self.faces.append((a,b,b+n,a+n))
        if cap:
            self.faces.extend([tuple(start+i for i in reversed(range(n))),tuple(start+(len(rings)-1)*n+i for i in range(n))])

    def pipe(self, points, radius, sides=8):
        points=list(map(Vector,points))
        rings=[]
        tangent=(points[-1]-points[0]).normalized()
        ref=Vector((1,0,0)) if abs(tangent.x)<.8 else Vector((0,1,0))
        for i,p in enumerate(points):
            tangent=(points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
            axis=tangent.cross(ref).normalized()
            if axis.length<.1: axis=tangent.cross(Vector((0,0,1))).normalized()
            other=tangent.cross(axis)
            rings.append([p+radius*(axis*math.cos(j*math.tau/sides)+other*math.sin(j*math.tau/sides)) for j in range(sides)])
        self.rows(rings)

    def cushion(self, levels, segments=28, power=.36, offset=0):
        rings=[]
        for y,half,depth,z in levels:
            ring=[]
            for i in range(segments):
                a=i*math.tau/segments
                co,si=math.cos(a),math.sin(a)
                ring.append((offset+half*math.copysign(abs(co)**power,co),y,z+depth*math.copysign(abs(si)**power,si)))
            rings.append(ring)
        self.rows(rings)

    def shell(self, profile, steps, thickness, back):
        # Surface curves across the spectator's body; connect its underside into a closed moulding.
        rings=[]
        for z,y,half in profile:
            ring=[]
            for i in range(steps+1):
                u=2*i/steps-1
                edge=u*u
                shoulder=max(0,(y-.80)/.12) if back else 0
                ring.append((half*u,y+(.032*edge if not back else -.026*shoulder*edge*edge),
                             z-(.072 if back else .014)*edge))
            rings.append(ring+[(x,h-(.005 if back else thickness),d+(thickness if back else .005)) for x,h,d in reversed(ring)])
        self.rows(rings)

    def object(self, name, material):
        mesh=bpy.data.meshes.new(name)
        mesh.from_pydata(self.verts,[],self.faces)
        mesh.update()
        bm=bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
        for edge in bm.edges:
            if edge.is_manifold and edge.calc_face_angle(0)>math.radians(52):edge.smooth=False
        bm.to_mesh(mesh)
        bm.free()
        for poly in mesh.polygons: poly.use_smooth=True
        obj=bpy.data.objects.new(name,mesh)
        bpy.context.collection.objects.link(obj)
        mesh.materials.append(material)
        if name=="Stand_Near_Resin":
            bevel=obj.modifiers.new("Radiused mould edges","BEVEL")
            bevel.width=.0045
            bevel.segments=3
            bevel.limit_method='ANGLE'
            bevel.angle_limit=math.radians(35)
            bpy.context.view_layer.objects.active=obj
            bpy.ops.object.modifier_apply(modifier=bevel.name)
        return obj


def masters(output):
    materials={
        "Resin":finish("Marine blue | moulded polypropylene","1c54a6",.34,.04,185),
        "Leather":finish("Saddle | grained leather","b46b43",.39,0,215),
        "Welt":finish("Saddle | edge welt","774029",.43),
        "Oak":finish("Smoked oak arms","915632",.34,.03,95),
        "Mount":finish("Graphite | powder-coated steel","343b43",.39,.56),
        "Alloy":finish("Satin stainless steel","a0a7ab",.28,.82),
    }
    models={}
    for club in (False,True):
        for detail in ('Far','Near'):
            hi=detail=='Near'
            kind='Club' if club else 'Stand'
            parts={key:Surface() for key in materials}
            mount=parts['Mount']
            alloy=parts['Alloy']
            if not club:
                resin=parts['Resin']
                back=[(.143,.48,.171),(.151,.52,.212),(.165,.62,.228),(.191,.77,.229),(.224,.88,.219),(.231,.910,.198),(.228,.918,.175)]
                pan=[(-.272,.451,.181),(-.264,.462,.203),(-.242,.476,.219),(-.167,.476,.227),(.07,.437,.218),(.136,.45,.195)]
                resin.shell(back if hi else back[::2],10 if hi else 4,.031,True)
                resin.shell(pan if hi else [pan[i] for i in (0,2,4,5)],8 if hi else 4,.024,False)
                mount.pipe([(0,.024,.014),(0,.372,.012)],.043,8 if hi else 5)
                mount.pipe([(-.189,.36,.03),(.189,.36,.03)],.024,8 if hi else 5)
                # Paired graphite arm pads on bent tubular brackets.
                for side in (-1,1):
                    x=side*.219
                    mount.pipe([(side*.17,.36,.035),(x,.395,.078),(x,.625,.085)],.013,8 if hi else 5)
                    mount.cushion([(.616,.020,.138,-.031),(.628,.026,.159,-.033),
                                   (.651,.025,.161,-.032),(.658,.019,.150,-.032)],
                                  16 if hi else 6,power=.42,offset=x)
                if hi:
                    mount.cushion([(.013,.115,.113,.013),(.035,.113,.111,.013)],12)
                    for side in [-1,1]:
                        x=.194*side
                        mount.pipe([(x,.36,.038),(x,.426,.14),(x,.66,.20)],.015)
                        alloy.pipe([(x,.427,.127),(x+side*.018,.427,.127)],.025,12)
                    for i in range(3):
                        y=.605+i*.028
                        # Rear stiffening ribs in the polypropylene mould.
                        resin.pipe([(-.144,y,.182),(-.075,y,.198),(0,y,.201),(.075,y,.198),(.144,y,.182)],.004,5)
            else:
                leather=parts['Leather']
                seg=32 if hi else 12
                leather.cushion([(.481,.268,.244,-.056),(.491,.282,.258,-.056),(.519,.290,.265,-.053),
                                  (.570,.289,.264,-.048),(.594,.273,.251,-.046),(.600,.245,.229,-.044)],seg)
                leather.cushion([(.524,.246,.056,.174),(.555,.27,.077,.172),(.649,.278,.084,.176),
                                 (.836,.281,.076,.204),(1.031,.279,.068,.24),(1.074,.263,.056,.245),
                                 (1.083,.233,.045,.244)],seg)
                for side in [-1,1]:
                    x=side*.323
                    parts['Oak'].cushion([(.625,.034,.239,-.012),(.641,.04,.254,-.012),(.663,.039,.252,-.012)],18 if hi else 8,offset=x)
                    leather.cushion([(.659,.037,.233,-.003),(.672,.041,.244,-.002),(.713,.040,.240,.0),(.727,.029,.224,.0)],seg if hi else 12,offset=x)
                    mount.pipe([(x,.334,.113),(x,.439,.127),(x,.645,.121)],.021,8)
                    mount.pipe([(side*.205,.041,.11),(side*.229,.291,.152),(side*.229,.478,.125)],.024,8)
                    mount.pipe([(side*.229,.36,.143),(x,.36,.122)],.022,8)
                    if hi:
                        mount.pipe([(side*.231,.218,.139),(side*.235,.492,-.135)],.017)
                        alloy.pipe([(side*.20,.043,.11),(side*.275,.043,.11)],.028)
                    if hi:
                        pts=[(side*.245,.57,.118),(side*.257,.63,.100),(side*.258,.82,.134),(side*.257,.989,.164),
                             (side*.253,1.027,.168),(side*.234,1.039,.172),(side*.16,1.044,.173),(0,1.045,.171)]
                        parts['Welt'].pipe(pts,.0028,6)
                mount.pipe([(-.228,.439,.118),(.228,.439,.118)],.029,8)
                if hi:
                    for k in [-1,1]:
                        mount.cushion([(.014,.08,.113,.09),(.034,.077,.105,.09)],16,offset=k*.209)
                    # A rolled welt mirrors the outline of the seat cushion.
                    rim=[]
                    for i in range(65):
                        co,si=math.cos(i*math.tau/64),math.sin(i*math.tau/64)
                        rim.append((.285*math.copysign(abs(co)**.36,co),.572,-.05+.258*math.copysign(abs(si)**.36,si)))
                    parts['Welt'].pipe(rim,.0027,5)
            objects=[part.object(f'{kind}_{detail}_{key}',materials[key]) for key,part in parts.items() if part.verts]
            models[kind,detail]=objects
    allobjs=[obj for group in models.values() for obj in group]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in allobjs:obj.select_set(True)
    bpy.context.view_layer.objects.active=allobjs[0]
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_yup=True,export_texcoords=False,export_tangents=False)
    return models


def number_plates(seats,collection):
    enamel=finish("Warm enamel | seat number","d1d8d9",.38,.17)
    ink=finish("Graphite | numerals","172b3d",.48)
    mesh_by_number={}
    for number in sorted({s[2] for s in seats}):
        curve=bpy.data.curves.new(f"Number {number}","FONT")
        curve.body=str(number)
        curve.size=.036
        curve.align_x='CENTER'
        curve.align_y='CENTER'
        text=bpy.data.objects.new(f"Type {number}",curve)
        bpy.context.collection.objects.link(text)
        curve.materials.append(ink)
        bpy.ops.object.select_all(action='DESELECT')
        bpy.context.view_layer.objects.active=text
        text.select_set(True)
        bpy.ops.object.convert(target='MESH')
        text=bpy.context.object
        verts=[(x*.5,y*.5,-.0007) for x,y in [(-.096,-.038),(.096,-.038),(.102,-.030),(.102,.030),(.096,.038),(-.096,.038),(-.102,.030),(-.102,-.030)]]
        mesh=bpy.data.meshes.new("Plaque")
        mesh.from_pydata(verts,[],[tuple(range(8))])
        plate=bpy.data.objects.new("Seat plate",mesh)
        bpy.context.collection.objects.link(plate)
        mesh.materials.append(enamel)
        plate.select_set(True)
        bpy.ops.object.join()
        mesh_by_number[number]=text.data
        mesh_by_number[number].use_fake_user=True
        bpy.data.objects.remove(text,do_unlink=True)
    for sec,row,num,x,h,z,yaw in seats:
        vip=sec>200
        depth=.16 if vip else .199
        obj=bpy.data.objects.new(f"Plate | {sec}-{row}-{num}",mesh_by_number[num])
        collection.objects.link(obj)
        obj.location=(x+math.sin(yaw)*depth,-(z+math.cos(yaw)*depth),h+(.986 if vip else .825))
        obj.rotation_euler=Euler((math.pi/2-.15,0,math.pi+yaw))

