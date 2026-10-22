#!/usr/bin/env python3
"""Convert the pinned MMC Works FBX into an aligned, pivot-preserving Blender GLB.

Run only through scripts/build-hero-car.mjs. Blender is pinned to 4.3.2 there; this script
relinks the archive's images to preprocessed copies, bakes source object transforms into geometry,
creates game-aligned wheel/steering pivots, and emits three independently simplified LOD trees.
Geometry compression and KTX2 encoding happen in the Node pipeline that follows.
"""
from __future__ import annotations

import argparse
import gc
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

EXPECTED_BLENDER = "4.3.2"
EXPECTED_SOURCE_MESHES = 84
EXPECTED_SOURCE_TRIANGLES = 114070
EXPECTED_SOURCE_FBX_SHA256 = "4d11eb251bd0958a749368befc30ac308cc80f226de82b5a98019718cb011206"
EXPECTED_MEDIA_SHA256 = "a9770ac049a95fe7037eccec1189948934306b510487d201378f666e77a40e8c"
WHEEL_SOURCES = [
    ("front-left", "Coupe-Wheel.Ft.L", "left", "front"),
    ("front-right", "Coupe-Wheel.Ft.R", "right", "front"),
    ("rear-left", "Coupe-Wheel.Bk.L", "left", "rear"),
    ("rear-right", "Coupe-Wheel.Bk.R", "right", "rear"),
]
STEERING_NAMES = {
    "steering-wheel-rim",
    "steering-wheel-frame",
    "steering-wheel-center",
    "steering-wheel-base",
}


def parse_args():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--textures", required=True)
    parser.add_argument("--texture-map", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--wheel-config", required=True)
    return parser.parse_args(raw)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def triangles(mesh) -> int:
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def is_descendant(obj, ancestor) -> bool:
    current = obj.parent
    while current is not None:
        if current == ancestor:
            return True
        current = current.parent
    return False


def mesh_world_points(objects):
    for obj in objects:
        if obj.type != "MESH":
            continue
        for vertex in obj.data.vertices:
            yield obj.matrix_world @ vertex.co


def bounds(points):
    points = list(points)
    if not points:
        raise RuntimeError("cannot compute bounds for an empty mesh set")
    minimum = [min(point[index] for point in points) for index in range(3)]
    maximum = [max(point[index] for point in points) for index in range(3)]
    return {
        "min": [float(value) for value in minimum],
        "max": [float(value) for value in maximum],
        "size": [float(maximum[i] - minimum[i]) for i in range(3)],
    }


def mesh_radius_around_axis(objects, center: Vector) -> float:
    radii = []
    for obj in objects:
        for vertex in obj.data.vertices:
            point = obj.matrix_world @ vertex.co
            radii.append(math.hypot(point.y - center.y, point.z - center.z))
    if not radii:
        raise RuntimeError("a wheel pivot has no tire mesh vertices")
    return max(radii)


def mesh_width_along_x(objects) -> float:
    coordinates = [
        (obj.matrix_world @ vertex.co).x
        for obj in objects
        for vertex in obj.data.vertices
    ]
    if not coordinates:
        raise RuntimeError("a wheel pivot has no tire width vertices")
    return max(coordinates) - min(coordinates)


def new_empty(collection, name: str, parent=None, location=(0.0, 0.0, 0.0)):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.08
    obj.location = location
    if parent is not None:
        obj.parent = parent
        obj.matrix_parent_inverse = Matrix.Identity(4)
    return obj


def make_mesh(collection, source, name: str, parent, transform: Matrix):
    mesh = source.data.copy()
    determinant = transform.to_3x3().determinant()
    mesh.transform(transform, shape_keys=True)
    if determinant < 0.0:
        mesh.flip_normals()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.parent = parent
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.location = (0.0, 0.0, 0.0)
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj.scale = (1.0, 1.0, 1.0)
    return obj


def join_mesh_objects(objects, name: str):
    """Join static surfaces while retaining material slots and the common parent/pivot."""
    objects = [obj for obj in objects if obj.type == "MESH"]
    if not objects:
        raise RuntimeError(f"cannot join an empty mesh group: {name}")
    if len(objects) == 1:
        active = objects[0]
    else:
        if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        active = objects[0]
        bpy.context.view_layer.objects.active = active
        bpy.ops.object.join()
        active = bpy.context.view_layer.objects.active
    active.name = name
    if active.data is not None:
        active.data.name = name + "-mesh"
    return active


def add_lod_tree(collection, source_root, level: int):
    """Copy the aligned LOD0 hierarchy and meshes, with stable unique node names."""
    suffix = f"-lod{level}"

    def duplicate(source, parent=None, is_root=False):
        target = source.copy()
        if source.data is not None:
            target.data = source.data.copy()
        target.animation_data_clear()
        target.name = f"lod{level}" if is_root else f"{source.name.rsplit('-lod0', 1)[0]}{suffix}"
        collection.objects.link(target)
        if parent is not None:
            target.parent = parent
            target.matrix_parent_inverse = Matrix.Identity(4)
        target.matrix_basis = source.matrix_basis.copy()
        for child in list(source.children):
            duplicate(child, target)
        return target

    return duplicate(source_root, is_root=True)


def descendants(root):
    stack = [root]
    while stack:
        current = stack.pop()
        yield current
        stack.extend(reversed(list(current.children)))


def simplify_tree(root, ratio: float):
    mesh_objects = [obj for obj in descendants(root) if obj.type == "MESH"]
    for obj in mesh_objects:
        if len(obj.data.polygons) < 4:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        modifier = obj.modifiers.new(name="hero-car-lod-decimate", type="DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        except RuntimeError as error:
            raise RuntimeError(f"could not simplify {obj.name}: {error}") from error
        obj.data.update()
    bpy.ops.object.select_all(action="DESELECT")


def tree_triangles(root) -> int:
    return sum(triangles(obj.data) for obj in descendants(root) if obj.type == "MESH")


def image_basename(image) -> str:
    filepath = bpy.path.abspath(image.filepath) if image.filepath else ""
    value = filepath if filepath else image.name
    return value.replace("\\\\", "/").rsplit("/", 1)[-1]


def relink_textures(textures_dir: Path, texture_map_path: Path):
    mapping = json.loads(texture_map_path.read_text(encoding="utf-8"))
    by_source = {entry["source"]: entry["output"] for entry in mapping["textures"]}
    replacements = {}
    used = []

    for material in bpy.data.materials:
        if not material.use_nodes or material.node_tree is None:
            continue
        for node in material.node_tree.nodes:
            if node.type != "TEX_IMAGE" or node.image is None:
                continue
            source_image = node.image
            source_name = image_basename(source_image)
            output_name = by_source.get(source_name)
            if output_name is None:
                raise RuntimeError(
                    f"image {source_image.name!r} ({source_name!r}) has no pinned texture mapping"
                )
            output_path = textures_dir / output_name
            if not output_path.is_file():
                raise RuntimeError(f"preprocessed image is missing: {output_path}")
            color_space = source_image.colorspace_settings.name
            # The media texture's alpha channel is data regardless of its RGB interpretation, so the
            # base-color and alpha nodes can share the same sRGB image without a duplicate datablock.
            if source_name == "media.png":
                color_space = "sRGB"
            key = (source_name, color_space)
            replacement = replacements.get(key)
            if replacement is None:
                replacement = bpy.data.images.load(str(output_path), check_existing=False)
                replacement.name = source_image.name
                replacement.colorspace_settings.name = color_space
                replacements[key] = replacement
                used.append({
                    "source": source_name,
                    "output": output_name,
                    "colorSpace": color_space,
                    "imageName": replacement.name,
                })
            node.image = replacement

    if not replacements:
        raise RuntimeError("the FBX materials reference no images")
    media_entry = next(
        (entry for entry in mapping["textures"] if entry["source"] == "media.png"),
        None,
    )
    media_path = textures_dir / mapping["mediaOutput"]
    if media_entry is None or media_entry["sourceSha256"] != EXPECTED_MEDIA_SHA256 or not media_path.is_file():
        raise RuntimeError("neutral dashboard media hash does not match the pinned source archive")

    media_material = bpy.data.materials.get("media")
    if media_material is None or not media_material.use_nodes:
        raise RuntimeError("the source material named 'media' is missing")
    principled = media_material.node_tree.nodes.get("Principled BSDF")
    if principled is None:
        raise RuntimeError("the 'media' material has no Principled BSDF node")
    base_link = next(
        (
            link
            for link in media_material.node_tree.links
            if link.to_node == principled and link.to_socket.name == "Base Color"
        ),
        None,
    )
    if base_link is None or base_link.from_node.type != "TEX_IMAGE":
        raise RuntimeError("the neutral dashboard image is not linked to the media base color")
    if Path(bpy.path.abspath(base_link.from_node.image.filepath)).name != mapping["mediaOutput"]:
        raise RuntimeError("the media material does not use the sanitized media.png image")

    # The FBX importer has already decoded the original 4K maps into Blender memory. Once every
    # material node points at the preprocessed, hash-verified replacements, release those originals
    # rather than keeping both texture sets live during the GLB export.
    replacement_pointers = {image.as_pointer() for image in replacements.values()}
    for image in list(bpy.data.images):
        if image.as_pointer() not in replacement_pointers:
            bpy.data.images.remove(image, do_unlink=True)
    gc.collect()
    return used


def main():
    args = parse_args()
    input_path = Path(args.input).resolve()
    textures_dir = Path(args.textures).resolve()
    texture_map_path = Path(args.texture_map).resolve()
    output_path = Path(args.output).resolve()
    report_path = Path(args.report).resolve()
    wheel_config = json.loads(Path(args.wheel_config).read_text(encoding="utf-8"))

    version = bpy.app.version_string.split(" ")[0]
    if version != EXPECTED_BLENDER:
        raise RuntimeError(f"Blender {EXPECTED_BLENDER} is required; found {version}")
    if sha256(input_path) != EXPECTED_SOURCE_FBX_SHA256:
        raise RuntimeError("FBX hash does not match the pinned MMC Works source")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.preferences.addon_enable(module="io_scene_gltf2")
    bpy.ops.import_scene.fbx(
        filepath=str(input_path),
        use_image_search=True,
        use_anim=False,
        automatic_bone_orientation=False,
        global_scale=1.0,
        bake_space_transform=False,
    )
    scene = bpy.context.scene
    source_objects = list(scene.objects)
    source_meshes = [obj for obj in source_objects if obj.type == "MESH"]
    source_triangles = sum(triangles(obj.data) for obj in source_meshes)
    if len(source_meshes) != EXPECTED_SOURCE_MESHES:
        raise RuntimeError(f"FBX has {len(source_meshes)} mesh objects; expected {EXPECTED_SOURCE_MESHES}")
    if source_triangles != EXPECTED_SOURCE_TRIANGLES:
        raise RuntimeError(f"FBX has {source_triangles} triangles; expected {EXPECTED_SOURCE_TRIANGLES}")

    body = bpy.data.objects.get("coupe.body")
    if body is None or body.type != "EMPTY":
        raise RuntimeError("the source FBX has no 'coupe.body' hierarchy root")
    pivot_objects = {}
    for key, source_name, _side, _axle in WHEEL_SOURCES:
        pivot = bpy.data.objects.get(source_name)
        if pivot is None or pivot.type != "EMPTY":
            raise RuntimeError(f"the source FBX is missing wheel pivot {source_name!r}")
        pivot_objects[key] = pivot

    steering_meshes = [obj for obj in source_meshes if obj.name in STEERING_NAMES]
    if {obj.name for obj in steering_meshes} != STEERING_NAMES:
        raise RuntimeError("the four source steering-wheel meshes are not present")
    wheel_meshes = {
        key: [child for child in pivot.children if child.type == "MESH"]
        for key, pivot in pivot_objects.items()
    }
    if any(len(items) != 2 for items in wheel_meshes.values()):
        raise RuntimeError("each named wheel pivot must retain exactly two source meshes")
    wheel_mesh_ids = {obj for meshes in wheel_meshes.values() for obj in meshes}
    body_hierarchy_meshes = [
        obj
        for obj in source_meshes
        if is_descendant(obj, body) and obj not in wheel_mesh_ids
    ]
    if len(body_hierarchy_meshes) != 76:
        raise RuntimeError(f"source body hierarchy has {len(body_hierarchy_meshes)} meshes; expected 76")
    body_meshes = [obj for obj in body_hierarchy_meshes if obj not in steering_meshes]
    if len(body_meshes) != 72:
        raise RuntimeError(f"source static body has {len(body_meshes)} meshes; expected 72 plus four steering meshes")

    relinked_textures = relink_textures(textures_dir, texture_map_path)

    source_pivots = {key: pivot.matrix_world.translation.copy() for key, pivot in pivot_objects.items()}
    front_y = sum(source_pivots[key].y for key in ("front-left", "front-right")) / 2.0
    rear_y = sum(source_pivots[key].y for key in ("rear-left", "rear-right")) / 2.0
    wheelbase_center_y = (front_y + rear_y) / 2.0
    wheel_center_z = sum(point.z for point in source_pivots.values()) / len(source_pivots)
    left_x = sum(source_pivots[key].x for key in ("front-left", "rear-left")) / 2.0
    right_x = sum(source_pivots[key].x for key in ("front-right", "rear-right")) / 2.0
    source_half_track = (left_x - right_x) / 2.0
    if source_half_track <= 0.0 or rear_y <= front_y:
        raise RuntimeError("source wheel pivots do not define a positive wheelbase and track")

    tire_meshes = {
        key: [obj for obj in meshes if "tire" in obj.name.lower()]
        for key, meshes in wheel_meshes.items()
    }
    if any(not meshes for meshes in tire_meshes.values()):
        raise RuntimeError("each named wheel pivot must contain a tire mesh")
    source_wheel_radius = max(
        mesh_radius_around_axis(tire_meshes[key], source_pivots[key])
        for key in wheel_meshes
    )
    source_tire_widths = {
        key: mesh_width_along_x(tire_meshes[key])
        for key in wheel_meshes
    }
    scale_x = wheel_config["halfTrack"] / source_half_track
    scale_y = wheel_config["radius"] / source_wheel_radius
    scale_z = (wheel_config["rearZ"] - wheel_config["frontZ"]) / (rear_y - front_y)

    def map_point(point: Vector):
        return Vector((
            -scale_x * (point.x - (left_x + right_x) / 2.0),
            wheel_config["anchorY"] - wheel_config["restLength"] + scale_y * (point.z - wheel_center_z),
            scale_z * (point.y - wheelbase_center_y),
        ))

    axis = Matrix((
        (-scale_x, 0.0, 0.0, 0.0),
        (0.0, 0.0, scale_y, 0.0),
        (0.0, scale_z, 0.0, 0.0),
        (0.0, 0.0, 0.0, 1.0),
    ))
    all_source_bounds = bounds(mesh_world_points(source_meshes))
    collection = bpy.data.collections.new("MMC Works Hero Car")
    scene.collection.children.link(collection)

    lod0 = new_empty(collection, "lod0")
    rig = new_empty(collection, "car-rig-lod0", lod0)
    body_group = new_empty(collection, "car-body-lod0", rig)
    for source in body_meshes:
        make_mesh(collection, source, f"{source.name}-lod0", body_group, axis @ source.matrix_world)

    steering_points = list(mesh_world_points(steering_meshes))
    steering_bounds = bounds(steering_points)
    steering_center = Vector(tuple(
        (steering_bounds["min"][i] + steering_bounds["max"][i]) / 2.0
        for i in range(3)
    ))
    steering_pivot = new_empty(
        collection,
        "steering-wheel-pivot-lod0",
        body_group,
        tuple(map_point(steering_center)),
    )
    source_steering_translation = Matrix.Translation(-steering_center)
    for source in steering_meshes:
        make_mesh(
            collection,
            source,
            f"{source.name}-lod0",
            steering_pivot,
            axis @ source_steering_translation @ source.matrix_world,
        )

    wheel_pivot_report = {}
    for key, source_name, side, axle in WHEEL_SOURCES:
        source_pivot = pivot_objects[key]
        target_location = map_point(source_pivots[key])
        pivot = new_empty(collection, f"wheel-{key}-lod0", rig, tuple(target_location))
        spinner = new_empty(collection, f"wheel-spinner-{key}-lod0", pivot)
        local_inverse = source_pivot.matrix_world.inverted_safe()
        wheel_width_scale = wheel_config["width"] / source_tire_widths[key]
        wheel_axis = Matrix((
            (-wheel_width_scale, 0.0, 0.0, 0.0),
            (0.0, 0.0, scale_y, 0.0),
            (0.0, scale_y, 0.0, 0.0),
            (0.0, 0.0, 0.0, 1.0),
        ))
        for source in wheel_meshes[key]:
            transform = wheel_axis @ local_inverse @ source.matrix_world
            make_mesh(collection, source, f"{source.name}-lod0", spinner, transform)
        wheel_pivot_report[key] = {
            "sourceNode": source_name,
            "node": f"wheel-{key}-lod0",
            "source": [float(v) for v in source_pivots[key]],
            "target": [float(v) for v in target_location],
            "side": side,
            "axle": axle,
            "sourceTireWidth": source_tire_widths[key],
            "targetTireWidth": wheel_config["width"],
            "wheelWidthScale": wheel_width_scale,
        }

    # Static body pieces are joined into one multi-material mesh, the steering assembly into one
    # pivoted mesh, and each wheel's tire/rim into one spinner mesh. This preserves materials and
    # pivots while cutting the source's 84 mesh objects to six draw objects per LOD.
    join_mesh_objects([obj for obj in body_group.children if obj.type == "MESH"], "car-body-surfaces-lod0")
    join_mesh_objects([obj for obj in steering_pivot.children if obj.type == "MESH"], "steering-wheel-assembly-lod0")
    for key, _source_name, _side, _axle in WHEEL_SOURCES:
        spinner = bpy.data.objects[f"wheel-spinner-{key}-lod0"]
        join_mesh_objects([obj for obj in spinner.children if obj.type == "MESH"], f"wheel-assembly-{key}-lod0")

    lod_roots = [lod0]
    for level, ratio in ((1, 0.45), (2, 0.15)):
        lod = add_lod_tree(collection, lod0, level)
        simplify_tree(lod, ratio)
        lod_roots.append(lod)

    lod_report = []
    for level, root in enumerate(lod_roots):
        lod_report.append({
            "level": level,
            "node": root.name,
            "ratio": (1.0, 0.45, 0.15)[level],
            "triangles": tree_triangles(root),
            "meshObjects": sum(1 for obj in descendants(root) if obj.type == "MESH"),
        })
    if not (lod_report[0]["triangles"] > lod_report[1]["triangles"] > lod_report[2]["triangles"] > 0):
        raise RuntimeError(f"LOD triangle counts are not strictly descending: {lod_report}")

    # The source armature is unskinned and unused. Remove all imported objects so only the clean,
    # explicitly named vehicle hierarchy reaches the GLB; copied mesh materials keep their textures.
    for source in source_objects:
        bpy.data.objects.remove(source, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    gc.collect()
    bpy.context.view_layer.update()
    lod0_meshes = [obj for obj in descendants(lod0) if obj.type == "MESH"]
    target_bounds = bounds(mesh_world_points(lod0_meshes))

    bpy.ops.object.select_all(action="DESELECT")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=False,
        export_yup=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_lights=False,
        export_cameras=False,
        export_extras=False,
        export_draco_mesh_compression_enable=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_keep_originals=False,
        export_apply=False,
    )

    texture_mapping = json.loads(texture_map_path.read_text(encoding="utf-8"))
    report = {
        "blenderVersion": version,
        "source": {
            "fbxSha256": sha256(input_path),
            "meshObjects": len(source_meshes),
            "triangles": source_triangles,
            "bodyHierarchyMeshes": len(body_hierarchy_meshes),
            "bodyStaticMeshes": len(body_meshes),
            "steeringMeshes": len(steering_meshes),
            "bounds": all_source_bounds,
        },
        "transform": {
            "sourceAxis": "+Y forward, +Z up, +X left",
            "gameAxis": "+Y up, -Z forward, +X right",
            "mapping": {
                "gameX": f"-{scale_x:.12f} * (sourceX - {(left_x + right_x) / 2.0:.12f})",
                "gameY": f"{wheel_config['anchorY'] - wheel_config['restLength']:.12f} + {scale_y:.12f} * (sourceZ - {wheel_center_z:.12f})",
                "gameZ": f"{scale_z:.12f} * (sourceY - {wheelbase_center_y:.12f})",
            },
            "sourceWheelbaseMeters": rear_y - front_y,
            "sourceHalfTrackMeters": source_half_track,
            "sourceWheelRadiusMeters": source_wheel_radius,
            "scale": {"x": scale_x, "verticalAndWheelRadius": scale_y, "length": scale_z},
            "bounds": target_bounds,
        },
        "wheelPivots": wheel_pivot_report,
        "steeringPivot": "steering-wheel-pivot-lod0",
        "lods": lod_report,
        "textures": relinked_textures,
        "neutralMedia": {
            "source": "textures/media.png",
            "sourceSha256": EXPECTED_MEDIA_SHA256,
            "material": "media",
            "outputName": texture_mapping["mediaOutput"],
        },
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
