"""Photograph the actual venue in Cycles. Camera framing follows the same seat transforms as the viewer."""
import bpy
import math
from mathutils import Vector


def light(name,at,aim,power,size,color):
    data=bpy.data.lights.new(name,'AREA')
    data.energy=power
    data.shape='DISK'
    data.size=size
    data.color=color
    obj=bpy.data.objects.new(name,data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location=at
    obj.rotation_euler=(Vector(aim)-Vector(at)).to_track_quat('-Z','Y').to_euler()
    return obj


def prepare(scene,seats):
    prefs=bpy.context.preferences.addons['cycles'].preferences
    scene.render.engine='CYCLES'
    try:
        prefs.compute_device_type='OPTIX'
        prefs.refresh_devices()
        gpus=[d for d in prefs.devices if d.type=='OPTIX']
        if gpus:
            for d in prefs.devices:d.use=d in gpus
            scene.cycles.device='GPU'
    except (TypeError,RuntimeError):
        pass
    scene.cycles.samples=48
    scene.cycles.use_denoising=True
    scene.cycles.max_bounces=6
    scene.render.resolution_x=1080
    scene.render.resolution_y=640
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='WEBP'
    scene.render.image_settings.quality=92
    scene.view_settings.view_transform='AgX'
    scene.world.use_nodes=True
    bg=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND')
    bg.inputs['Color'].default_value=(.22,.29,.38,1)
    bg.inputs['Strength'].default_value=.48
    result=[]
    for sector,row,number,suffix in [(102,6,11,'stand'),(201,1,7,'club')]:
        s=next(a for a in seats if a[:3]==[sector,row,number])
        _,_,_,x,h,z,yaw=s
        def local(right,height,depth):
            return Vector((x+math.cos(yaw)*right+math.sin(yaw)*depth,
                           -(z-math.sin(yaw)*right+math.cos(yaw)*depth),h+height))
        cam=bpy.data.cameras.new('Seat portrait '+suffix)
        obj=bpy.data.objects.new('Seat portrait '+suffix,cam)
        scene.collection.objects.link(obj)
        club=sector>200
        obj.location=local(1.0 if club else -.98,1.24 if club else 1.37,-1.72 if club else -1.60)
        target=local(-.08,.68 if club else .61,.02)
        obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
        cam.lens=38 if club else 35
        cam.dof.use_dof=True
        cam.dof.focus_distance=(obj.location-target).length
        cam.dof.aperture_fstop=3.8 if club else 4.5
        light('Softbox '+suffix,local(-2.3,3.3,-1.9),target,195 if club else 260,2.6,(1,.81,.65) if club else (.87,.95,1))
        light('Kicker '+suffix,local(2.0,2.25,.95),target,155 if club else 220,1.4,(1,.77,.51) if club else (.57,.76,1))
        if club:
            light('Lounge wall wash',local(-.8,2.9,2.0),local(0,1,3.8),95,1.5,(1,.57,.31))
        result.append((obj,suffix))
    return result


def render(scene,cameras,out):
    original=scene.camera
    for camera,name in cameras:
        scene.camera=camera
        scene.render.filepath=str(out/f'{name}-seats.webp')
        bpy.ops.render.render(write_still=True)
    scene.camera=original

