"""Joint-local workwear meshes for the mechanic's existing Cocos rig."""

from math import cos, pi, sin

import bpy
from mathutils import Vector


def _around(count):
    return [(cos(2 * pi * i / count), sin(2 * pi * i / count)) for i in range(count)]


def _loft(name, levels, surface, *, outline=None, axis='Z'):
    # Each level is (axis coordinate, center U, center V, radius U, radius V,
    # cloth-fold amplitude). Levels run from the positive end to the negative end.
    outline = outline or _around(12)
    size = len(outline)
    vertices = []
    for index, (height, center_u, center_v, radius_u, radius_v, fold) in enumerate(levels):
        for i, (u, v) in enumerate(outline):
            angle = 2 * pi * i / size
            drape = 1 + fold * (0.62 * cos(3 * angle + index * 1.37)
                                + 0.38 * sin(5 * angle - index * 0.91))
            a = center_u + u * radius_u * drape
            b = center_v + v * radius_v * drape
            if axis == 'X':
                vertices.append((height, a, b))
            elif axis == 'Y':
                vertices.append((b, height, a))
            else:
                vertices.append((a, b, height))

    faces = [tuple(range(size))]
    for ring in range(len(levels) - 1):
        for side in range(size):
            next_side = (side + 1) % size
            faces.append((ring * size + side, (ring + 1) * size + side,
                          (ring + 1) * size + next_side, ring * size + next_side))
    last = (len(levels) - 1) * size
    faces.append(tuple(last + i for i in reversed(range(size))))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name='UVMap')
    for polygon in mesh.polygons:
        cap = polygon.index in (0, len(faces) - 1)
        polygon.use_smooth = not cap
        for loop in polygon.loop_indices:
            vertex = mesh.loops[loop].vertex_index
            if cap:
                px, py = outline[vertex % size]
                uv_layer.data[loop].uv = (px * 0.5 + 0.5, py * 0.5 + 0.5)
            else:
                face_side = (polygon.index - 1) % size
                side = vertex % size
                if side == 0 and face_side == size - 1:
                    side = size
                distance = (levels[0][0] - levels[vertex // size][0]) / (levels[0][0] - levels[-1][0])
                uv_layer.data[loop].uv = (side / size, 1 - distance)
    obj = bpy.data.objects.new(name, mesh)
    obj['surface'] = surface
    obj['keep_uv'] = True
    return obj


_CUT_CORNERS = [
    (1, 0.65), (0.65, 1), (-0.65, 1), (-1, 0.65),
    (-1, -0.65), (-0.65, -1), (0.65, -1), (1, -0.65),
]
_SHOE_OUTLINE = [
    (-1, -0.61), (-0.82, -0.87), (0.26, -0.98), (0.72, -1),
    (0.94, -0.77), (1, -0.52), (1, 0.52), (0.94, 0.77),
    (0.72, 1), (0.26, 0.98), (-0.82, 0.87), (-1, 0.61),
]
_KNEE_OUTLINE = [
    (1, -.16), (.86, .69), (.54, 1), (-.54, 1), (-.86, .69),
    (-1, -.16), (-.78, -.75), (-.48, -1), (.48, -1), (.78, -.75),
]


def _panel(name, center, dimensions, surface, *, axis='X', bevel=True):
    x, y, z = center
    rx, ry, rz = (dimension / 2 for dimension in dimensions)
    if axis == 'Y':
        depth, u, v = y, z, x
        half, ru, rv = ry, rz, rx
    elif axis == 'Z':
        depth, u, v = z, x, y
        half, ru, rv = rz, rx, ry
    else:
        depth, u, v = x, y, z
        half, ru, rv = rx, ry, rz
    levels = [(depth + half, u, v, ru * 0.85, rv * 0.88, 0)]
    if bevel:
        levels.append((depth + half * 0.30, u, v, ru, rv, 0))
    levels.append((depth - half, u, v, ru, rv, 0))
    return _loft(name, levels, surface, outline=_CUT_CORNERS, axis=axis)


def _with_tiles(obj, tiles, choose_tile):
    obj['surfaces'] = tiles
    for _ in tiles:
        obj.data.materials.append(None)
    for polygon in obj.data.polygons:
        polygon.material_index = choose_tile(polygon)
    return obj


def _topstitch(name, path, surface, radius=.003):
    points = [Vector(point) for point in path]
    positions = []
    sides = 5
    for i, point in enumerate(points):
        forward = (points[min(i+1,len(points)-1)] - points[max(i-1,0)]).normalized()
        across = forward.cross(Vector((1,0,0)))
        if across.length < .001:
            across = forward.cross(Vector((0,1,0)))
        across.normalize()
        depth = forward.cross(across).normalized()
        positions.extend(point + radius*(u*across + v*depth) for u,v in _around(sides))
    faces = [tuple(reversed(range(sides)))]
    for row in range(len(path)-1):
        for i in range(sides):
            a = row*sides+i
            b = row*sides+(i+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.append(tuple(range(len(positions)-sides,len(positions))))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(positions,[],faces)
    mesh.update()
    obj = bpy.data.objects.new(name,mesh)
    obj['surface'] = surface
    return obj


def _rim_thread(cuff, points_per_ring, row, surface):
    """Follow an existing ring of cuff vertices so thread sits on the fold."""
    path = []
    for i in range(points_per_ring + 1):
        point = cuff.data.vertices[row * points_per_ring + i % points_per_ring].co
        normal = Vector((point.x - .01, point.y, 0)).normalized()
        path.append(point + normal * .0018)
    return _topstitch('Cuff lockstitch', path, surface, .002)


def _shoulder(s, side):
    sleeve = _loft('Navy coverall sleeve | folds and shoulder yoke', [
        (0.084,-.015,-side*.014,.044,.056,0.00),
        (0.064,-.026,-side*.018,.093,.095,0.010),
        (0.027,-.019,-side*.024,.117,.122,0.027),
        (-.015,-.014,-side*.017,.136,.129,0.049),
        (-.077,-.004,-side*.005,.130,.130,0.079),
        (-.124,.006,0,.118,.124,0.058),
        (-.148,.005,side*.006,.121,.121,0.066),
        (-.170,.008,0,.105,.104,0.027),
        (-.196,.009,0,.096,.094,0.012),
    ],s['CANVAS'],outline=_around(24))

    def yoke(polygon):
        if not 1 <= polygon.index < len(sleeve.data.polygons)-1:
            return 0
        direction = ((polygon.index-1) % 24 + .5) * pi/12
        row = (polygon.index-1) // 24
        return 1 if row < 4 and side*sin(direction) > .22 and cos(direction) > -.73 else 0

    rolled_cuff = _loft('Turned twill hem | fold valleys and inner return', [
        (-.151,.007,0,.111,.113,.024),(-.165,.008,0,.123,.125,.035),
        (-.179,.012,0,.126,.128,.029),(-.189,.010,0,.117,.118,.020),
        (-.202,.011,0,.122,.124,.028),(-.217,.012,0,.123,.124,.023),
        (-.229,.010,0,.116,.116,.022),(-.235,.011,0,.107,.108,.016),
        (-.239,.012,0,.099,.098,.009),(-.242,.012,0,.085,.088,.008),
    ], s['IVORY'], outline=_around(24))
    cuff = _with_tiles(rolled_cuff, [s['IVORY'],s['IVORY_EDGE']],
                       lambda p: int(1 <= p.index < len(rolled_cuff.data.polygons)-1 and
                                     (p.index-1) // 24 in (0,2,6,7,8)))
    return [
        _with_tiles(sleeve,[s['CANVAS'],s['ORANGE']],yoke),
        cuff,
        _rim_thread(cuff, 24, 5, s['IVORY_EDGE']),
        _topstitch('Flat-felled sleeve seam', [
            (.011,side*.119,-.034),(.009,side*.127,-.070),(.010,side*.126,-.102),
            (.002,side*.117,-.129),(-.002,side*.120,-.148),
        ], s['EDGE'], .0024),
    ]


def _forearm(s, side):
    palm = _loft('Pale glove palm with inset pad', [
        (-.179,.046,0,.064,.070,.00),(-.198,.051,0,.081,.089,.00),
        (-.216,.050,.003*side,.085,.090,.027),(-.233,.053,.004*side,.083,.089,.019),
        (-.252,.056,.005*side,.081,.084,.00),(-.270,.060,.006*side,.071,.079,.00),
        (-.285,.053,.006*side,.045,.056,.00),
    ], s['IVORY'], outline=_around(20))

    def palm_pad(polygon):
        if not 1 <= polygon.index < len(palm.data.polygons)-1:
            return 0
        row, angle = divmod(polygon.index-1,20)
        if row >= 2 and angle in (18,19,0,1):
            return 1
        if row == 0 or (row >= 5 and angle in (2,3,16,17)):
            return 2
        return 0

    parts = [
        _loft('Warm exposed forearm', [
            (.066,.002,0,.067,.066,.00),(.039,.001,0,.086,.079,.017),
            (.005,.006,0,.098,.084,.012),(-.037,.018,0,.086,.080,.016),
            (-.081,.027,0,.077,.071,.015),(-.123,.036,.001*side,.067,.061,.013),
            (-.166,.040,.003*side,.058,.060,.00),(-.182,.043,.006*side,.062,.061,.00),
        ], s['SKIN'], outline=_around(22)),
        _loft('Orange insulating glove cuff', [
            (-.139,.044,0,.070,.072,.000),(-.148,.039,0,.083,.081,.020),
            (-.158,.039,0,.086,.087,.010),(-.182,.044,0,.083,.084,.016),
            (-.198,.046,0,.083,.085,.000),
        ], s['ORANGE'], outline=_around(16)),
        _loft('Dipped glove cuff binding', [
            (-.186,.044,0,.083,.084,.009),(-.192,.044,0,.087,.089,.011),
            (-.199,.045,0,.084,.086,.010),(-.205,.045,0,.076,.078,.003),
        ], s['ORANGE_EDGE'], outline=_around(18)),
        _panel('Wrist closure patch',(-.023,.051*side,-.168),(.052,.079,.042),s['WEBBING']),
        _panel('Wrist closure keeper',(-.041,.053*side,-.167),(.022,.055,.028),s['ORANGE_EDGE']),
        _panel('Closure catch tongue',(-.055,.056*side,-.167),(.010,.036,.013),s['CUT_STEEL'],bevel=False),
        _with_tiles(palm, [s['IVORY'],s['RUBBER'],s['IVORY_EDGE']], palm_pad),
        _panel('Dorsal glove knuckle plate',(-.027,0,-.219),(.034,.122,.066),s['ORANGE']),
        _panel('First knuckle pad',(-.047,-.030,-.232),(.013,.040,.031),s['ORANGE_EDGE'],bevel=False),
        _panel('Second knuckle pad',(-.047,.032,-.232),(.013,.040,.031),s['ORANGE_EDGE'],bevel=False),
        _topstitch('Glove reinforcement topstitch', [
            (-.024,-.049,-.204),(-.033,-.066,-.223),(-.022,-.069,-.255),
            (-.005,-.045,-.271),(-.006,.043,-.271),(-.022,.067,-.254),(-.035,.057,-.215),
        ],s['STITCH'],.0025),
        _loft('Opposable padded thumb', [
            (-.196,.068,-side*.051,.024,.021,.00),(-.209,.095,-side*.064,.029,.021,.00),
            (-.223,.118,-side*.062,.030,.026,.00),(-.235,.123,-side*.055,.028,.023,.00),
            (-.248,.113,-side*.047,.027,.022,.00),(-.259,.098,-side*.043,.019,.017,.00),
        ], s['IVORY'], outline=_around(12)),
    ]
    # Fingertips and thumb wrap the same grip, mirrored on the two forearms.
    for i, across in enumerate((-.042,-.004,.033,.064)):
        drop = -.261-(.004 if i in (1,2) else 0)
        pos = across * side
        finger = _loft(f'Curled padded glove finger {i+1}', [
            (drop+.032,.074,pos,.027,.018,.00),
            (drop+.015,.100,pos,.031,.020,.00),
            (drop+.005,.112,pos,.027,.017,.00),
            (drop-.007,.106,pos,.026,.0185,.00),
            (drop-.019,.094,pos,.023,.0175,.00),
            (drop-.028,.080,pos,.0145,.011,.00),
        ], s['IVORY'], outline=_around(10))
        parts.append(_with_tiles(finger, [s['IVORY'],s['IVORY_EDGE'],s['RUBBER']],
                                 lambda p: 2 if p.index > 40 else int(p.index > 20)))
    return parts


def _paint_trouser_stripe(obj, s, side, sides):
    stripe = lambda polygon: int(
        1 <= polygon.index < len(obj.data.polygons)-1
        and (polygon.index-1) % sides == (sides // 5 if side > 0 else sides-1-sides//5))
    return _with_tiles(obj,[s['CANVAS'],s['PETROL']],stripe)


def _thigh(s, side):
    pants = _loft('Night navy cargo trousers | shaped and folded thigh', [
        (.092,.006,-side*.024,.096,.102,.00),(.055,.007,-side*.017,.138,.125,.014),
        (-.008,.004,-side*.013,.146,.141,.039),(-.067,.005,-side*.002,.144,.146,.062),
        (-.126,.003,side*.009,.149,.143,.093),(-.158,.009,side*.010,.143,.133,.110),
        (-.176,.021,side*.008,.132,.128,.141),(-.194,.017,side*.005,.141,.136,.105),
        (-.212,.028,.007*side,.135,.125,.172),(-.237,.010,.008*side,.143,.141,.142),
        (-.256,-.006,.008*side,.133,.131,.125),(-.274,.012,.006*side,.121,.130,.146),
        (-.303,.017,.006*side,.131,.127,.108),
        (-.334,.008,.006*side,.116,.112,.054),
        (-.363,.003,0,.096,.087,.00),
    ],s['CANVAS'],outline=_around(28))
    parts = [
        _paint_trouser_stripe(pants,s,side,28),
        _loft('Cargo harness leg loop',[
            (-.104,.010,0,.136,.142,.028),(-.107,.011,0,.146,.146,.027),
            (-.135,.010,0,.144,.146,.028),(-.140,.008,0,.136,.142,.018),
        ],s['WEBBING'],outline=_around(18)),
        _panel('Folded side cargo pocket',(-.023,side*.130,-.141),
               (.147,.059,.147),s['ORANGE'],axis='Y'),
        _panel('Darker cargo pocket seam',(.002,side*.155,-.181),
               (.079,.020,.057),s['ORANGE_EDGE'],axis='Y',bevel=False),
        _panel('Bright diagonal cargo flap',(.014,side*.164,-.091),
               (.154,.035,.057),s['ORANGE'],axis='Y'),
        _panel('Cargo flap hardware button',(.018,side*.184,-.094),
               (.023,.014,.022),s['CUT_STEEL'],axis='Y',bevel=False),
        _topstitch('Double-needle cargo flap hem', [
            (-.051,side*.177,-.098),(-.028,side*.181,-.108),
            (.067,side*.181,-.107),(.079,side*.174,-.099),
        ], s['ORANGE_EDGE'], .0027),
        _panel('Front knee abrasive cloth reinforcement',(.121,0,-.239),
               (.049,.158,.110),s['CANVAS_LIT'],bevel=True),
        _panel('Back patch pocket with folded reinforcement',(-.136,0,-.075),
               (.025,.148,.131),s['CANVAS_LIT'],bevel=False),
        _panel('Back pocket orange hem',(-.151,0,-.030),
               (.014,.141,.029),s['ORANGE_EDGE'],bevel=False),
        _topstitch('Back pocket sewn outer seam',[
            (-.152,-.068,-.043),(-.153,-.066,-.109),(-.154,-.045,-.133),
            (-.154,.040,-.135),(-.153,.068,-.104),(-.152,.068,-.041),
        ],s['STITCH'],.0031),
        _topstitch('Outseam on the upper trousers',[
            (-.038,.139*side,-.064),(-.059,.142*side,-.129),(-.047,.134*side,-.172),
            (-.032,.137*side,-.226),(-.036,.123*side,-.264),(-.029,.130*side,-.304),
        ],s['STITCH'],.0030),
    ]
    if side < 0:
        parts.append(_panel('Leg-loop belt adjuster',(.095,-.124,-.115),
                            (.033,.030,.051),s['CUT_STEEL'],axis='Y',bevel=False))
    return parts


def _boot_upper(s):
    boot = _loft('Laced iron toe work boot with leather uppers',[
        (-.128,-.019,0,.104,.105,.00),(-.154,-.001,0,.119,.111,.00),
        (-.177,.020,0,.146,.116,.00),(-.192,.027,0,.159,.119,.00),
        (-.218,.047,0,.188,.123,.00),(-.233,.055,0,.199,.127,.00),
        (-.249,.055,0,.211,.130,.00),(-.269,.054,0,.209,.133,.00),
    ],s['BOOT'],outline=_SHOE_OUTLINE)
    def toe_and_heel(polygon):
        if not 1 <= polygon.index < len(boot.data.polygons)-1:
            return 0
        row, angle = divmod(polygon.index-1,len(_SHOE_OUTLINE))
        if row >= 3 and 2 <= angle <= 8:
            return 3 if row in (3,5) and 3 <= angle <= 7 else 1
        if row >= 1 and angle in (0,10,11):
            return 2
        return 0

    return _with_tiles(boot,[s['BOOT'],s['KNEE'],s['WEBBING'],s['GUNMETAL']],toe_and_heel)


def _knee_hardware(s, side):
    impact_pad = _loft('Molded shock liner', [
        (.161,0,-.014,.097,.081,.00),(.153,0,-.016,.108,.090,.00),
        (.125,0,-.018,.108,.092,.00),(.081,0,-.018,.098,.085,.00),
    ], s['RUBBER'], outline=_KNEE_OUTLINE, axis='X')
    shell = _loft('Drawn kneecap shell | rolled rim and crowned face', [
        (.205,0,-.011,.047,.055,.00),(.201,0,-.012,.064,.063,.00),
        (.191,0,-.013,.087,.071,.00),(.174,0,-.014,.096,.079,.00),
        (.159,0,-.013,.093,.078,.00),(.151,0,-.015,.088,.071,.00),
    ], s['KNEE'], outline=_KNEE_OUTLINE, axis='X')
    merged_shell = _with_tiles(shell, [s['KNEE'],s['GUNMETAL']],
                               lambda p: int(31 <= p.index <= 50))
    parts = [
        impact_pad, merged_shell,
        _panel('Harness adjustment bridge',(.023,side*.133,-.065),
               (.058,.023,.044),s['CUT_STEEL'],axis='Y'),
        _panel('Webbing through adjuster',(.031,side*.147,-.067),
               (.046,.014,.024),s['STRAP'],axis='Y',bevel=False),
        _panel('Return tab on webbing',(.076,side*.139,-.067),
               (.031,.022,.029),s['WEBBING'],axis='Y',bevel=False),
    ]
    for across in (-.070,.070):
        parts.append(_loft('Low-profile shell rivet', [
            (.194,across,.014,.010,.010,.00),(.191,across,.014,.013,.012,.00),
            (.184,across,.014,.013,.012,.00),(.177,across,.014,.010,.010,.00),
        ], s['CUT_STEEL'], outline=_around(10), axis='X'))
    return parts


def _shin(s, side):
    pants = _loft('Lower trouser leg and gathered work cuff',[
        (.076,.001,0,.072,.075,.00),(.038,.002,0,.112,.110,.020),
        (-.010,.005,0,.117,.112,.038),(-.049,.007,side*.004,.127,.121,.083),
        (-.082,.012,side*.009,.131,.127,.119),(-.101,.019,side*.013,.118,.117,.096),
        (-.123,.011,side*.004,.122,.125,.134),(-.148,-.012,side*.006,.119,.115,.147),
        (-.169,-.008,side*.007,.103,.109,.075),
        (-.202,-.006,0,.090,.096,.009),
    ],s['CANVAS'],outline=_around(28))
    parts = [
        _paint_trouser_stripe(pants,s,side,28),
        _loft('Knee guard strap',[
            (-.046,.006,0,.130,.129,.00),(-.058,.006,0,.138,.134,.00),
            (-.075,.003,0,.131,.134,.00),(-.087,.003,0,.128,.127,.00),
        ],s['WEBBING'],outline=_around(20)),
        *_knee_hardware(s, side),
        _loft('Trouser hem at boot',[
            (-.164,0,0,.103,.107,.033),(-.174,0,0,.111,.110,.036),
            (-.194,-.005,0,.101,.103,.014),(-.201,-.006,0,.093,.099,.010),
        ],s['CANVAS_LIT'],outline=_around(20)),
        _boot_upper(s),
        _loft('Brown stitched welt', [
            (-.256,.058,0,.210,.135,.00),(-.263,.058,0,.218,.140,.00),
            (-.278,.057,0,.218,.141,.00),(-.293,.056,0,.214,.139,.00),
        ], s['LEATHER'], outline=_SHOE_OUTLINE),
        _loft('Recessed charcoal rubber sole', [
            (-.286,.056,0,.204,.131,.00),(-.294,.056,0,.210,.135,.00),
            (-.308,.056,0,.209,.136,.00),(-.314,.055,0,.206,.134,.00),
        ], s['RUBBER'], outline=_SHOE_OUTLINE),
        _panel('Orange toe-side pull tab',(.077,side*.069,-.176),
               (.083,.023,.019),s['ORANGE_EDGE'],axis='Z'),
        _panel('Rear orange boot pull tab',(-.120,0,-.129),
               (.025,.065,.079),s['ORANGE_EDGE'],axis='X'),
        _topstitch('Boot welt stitch line',[
            (-.128,0,-.257),(-.105,-.103,-.259),(.046,-.133,-.260),
            (.204,-.113,-.260),(.247,-.064,-.260),(.250,.063,-.260),
            (.205,.113,-.260),(.046,.133,-.260),(-.104,.103,-.259),(-.128,0,-.257),
        ],s['STITCH'],.0029),
    ]
    for x, width in ((-.095,.197),(-.018,.231),(.066,.256),(.151,.253),(.220,.199)):
        parts.append(_panel('Molded rubber tread block',(x,0,-.310),
                            (.052,width,.035),s['RUBBER'],axis='Z',bevel=False))
    row = ((.079,-.140),(.117,-.155),(.152,-.177))
    for x,height in row:
        for across in (-.052,.052):
            parts.append(_loft('Lace eyelet ring seat', [
                (height+.004,x,across,.009,.009,.00),(height,x,across,.011,.011,.00),
                (height-.010,x,across,.009,.009,.00),
            ], s['ORANGE_EDGE'], outline=_around(8)))
    for (x,height),(next_x,next_height) in zip(row,row[1:]):
        for sign in (-1,1):
            parts.append(_topstitch('Waxed crossover lace', [
                (x,.052*sign,height+.004),
                ((x+next_x)/2,0,(height+next_height)/2+.008),
                (next_x,-.052*sign,next_height+.004),
            ], s['STRAP'], .0052))
    return parts


def build_limbs(attach, surfaces):
    """Hand each complete rigid joint segment to the shared atlas assembler."""
    for suffix, side in (('Minus',1),('Plus',-1)):
        attach('Shoulder'+suffix,_shoulder(surfaces,side))
        attach('Forearm'+suffix,_forearm(surfaces,side))
        attach('Thigh'+suffix,_thigh(surfaces,side))
        attach('Shin'+suffix,_shin(surfaces,side))
