"""Editable hard-surface gear and shaped fabric for the torso and head."""

from math import cos, exp, pi, sin

import bpy
from mathutils import Matrix, Vector


def build_body(attach, surfaces):
    def mesh(name, positions, faces, surface, smooth=False):
        data = bpy.data.meshes.new(name)
        data.from_pydata(positions, [], faces)
        data.update()
        for polygon in data.polygons:
            polygon.use_smooth = smooth
        result = bpy.data.objects.new(name, data)
        result['surface'] = surfaces[surface]
        return result

    def rings(name, rows, surface, sides=16, smooth=True):
        """Rows are height, center depth, half-depth and half-width."""
        points = [(x + a * cos(i * 2 * pi / sides), b * sin(i * 2 * pi / sides), z)
                  for z, x, a, b in rows for i in range(sides)]
        faces = [tuple(reversed(range(sides)))]
        for j in range(len(rows) - 1):
            for i in range(sides):
                a = j * sides + i
                b = j * sides + (i + 1) % sides
                faces.append((a, b, b + sides, a + sides))
        faces.append(tuple(range((len(rows) - 1) * sides, len(rows) * sides)))
        return mesh(name, points, faces, surface, smooth)

    def scalp_patch(name, rows, surface, sides=12):
        points = [(x + a * cos(pi * (.376 + i * 1.248 / sides)),
                   b * sin(pi * (.376 + i * 1.248 / sides)), z)
                  for z, x, a, b in rows for i in range(sides + 1)]
        stride = sides + 1
        faces = []
        for row in range(len(rows) - 1):
            for i in range(sides):
                a = row * stride + i
                faces.append((a, a + 1, a + 1 + stride, a + stride))
        return mesh(name, points, faces, surface, True)

    def plate(name, center, size, surface, edge=None, angle=0):
        x, y, z = center
        a, b, c = (dim / 2 for dim in size)
        d = min(a, b, c) * 0.68 if edge is None else min(edge, a * 0.8, b * 0.8, c * 0.85)
        corners = ((1, 0.60), (0.60, 1), (-0.60, 1), (-1, 0.60),
                   (-1, -0.60), (-0.60, -1), (0.60, -1), (1, -0.60))
        positions = []
        levels = ((-c, d), (-c + d, 0), (c - d, 0), (c, d)) if d >= .006 else ((-c, 0), (c, d))
        for rz, inset in levels:
            for ax, ay in corners:
                px = ax * (a - inset)
                positions.append((x + px * cos(angle) + rz * sin(angle),
                                  y + ay * (b - inset), z + rz * cos(angle) - px * sin(angle)))
        faces = [tuple(reversed(range(8)))]
        for j in range(len(levels) - 1):
            for i in range(8):
                a = j * 8 + i
                b = j * 8 + (i + 1) % 8
                faces.append((a, b, b + 8, a + 8))
        faces.append(tuple(range(len(positions)-8, len(positions))))
        return mesh(name, positions, faces, surface)

    def strand(name, route, radius, surface, sides=5):
        points = [Vector(point) for point in route]
        rim = []
        for i, center in enumerate(points):
            tangent = (points[min(i + 1, len(points) - 1)] - points[max(0, i - 1)]).normalized()
            cross = tangent.cross(Vector((1, 0, 0)))
            if cross.length < .001:
                cross = tangent.cross(Vector((0, 1, 0)))
            u = cross.normalized()
            v = tangent.cross(u)
            rim.extend(center + radius * (cos(j * 2 * pi / sides) * u + sin(j * 2 * pi / sides) * v)
                       for j in range(sides))
        faces = [tuple(reversed(range(sides)))]
        for i in range(len(route) - 1):
            for j in range(sides):
                a = i * sides + j
                b = i * sides + (j + 1) % sides
                faces.append((a, b, b + sides, a + sides))
        faces.append(tuple(range((len(points) - 1) * sides, len(points) * sides)))
        return mesh(name, rim, faces, surface, True)

    def lens(name, x, y, z, dy, dz, thickness, surface, sides=12):
        """A sealed curved lens or flanged bezel with its working face toward +X."""
        points = [(x + center + abs(sin(i * 2 * pi / sides) * dy) * -.12,
                   y + dy * gain * cos(i * 2 * pi / sides), z + dz * gain * sin(i * 2 * pi / sides))
                  for center, gain in ((-thickness / 2, .82), (0, 1), (thickness / 2, .8))
                  for i in range(sides)]
        faces = [tuple(reversed(range(sides)))]
        for j in range(2):
            for i in range(sides):
                a = j * sides + i
                b = j * sides + (i + 1) % sides
                faces.append((a, b, b + sides, a + sides))
        faces.append(tuple(range(sides * 2, sides * 3)))
        return mesh(name, points, faces, surface, True)

    def panel(name, outline, thickness, surface):
        front = [Vector(point) for point in outline]
        normal = (front[1] - front[0]).cross(front[2] - front[1]).normalized()
        vertices = [p - thickness * normal for p in front] + front
        count = len(front)
        faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
        faces.extend((i, (i+1) % count, (i+1) % count + count, i + count) for i in range(count))
        return mesh(name, vertices, faces, surface)

    def route(name, checkpoints, radius, surface, sides=6):
        """Round continuous parts with Catmull-Rom curvature."""
        curve = [Vector(point) for point in checkpoints]
        refined = []
        for i in range(len(curve) - 1):
            a, b, c, d = (curve[max(i-1, 0)], curve[i], curve[i+1], curve[min(i+2, len(curve)-1)])
            for j in range(3):
                t = j / 3
                refined.append(.5 * (2*b + (c-a)*t + (2*a-5*b+4*c-d)*t*t
                                     + (3*b-3*c+d-a)*t*t*t))
        return strand(name, refined + [curve[-1]], radius, surface, sides)

    def lock(name, points, thicknesses, surface):
        """Tapered asymmetric hair ribbon with a closed back."""
        direction = Vector((.95, .26, .03))
        vertices, faces = [], []
        for i, point in enumerate(points):
            a = Vector(points[max(0, i-1)])
            b = Vector(points[min(i+1, len(points)-1)])
            vector = (b-a).normalized()
            depth = (direction - direction.dot(vector)*vector).normalized()
            width = vector.cross(depth).normalized()
            lateral, puff = thicknesses[i]
            vertices.extend(Vector(point) + depth*(puff*cos(j*pi/4)) + width*(lateral*sin(j*pi/4))
                            for j in range(8))
        for layer in range(len(points)-1):
            for step in range(8):
                a = 8*layer + step
                b = 8*layer + (step+1)%8
                faces.append((a, b, b+8, a+8))
        faces.extend((tuple(reversed(range(8))), tuple(range(len(vertices)-8, len(vertices)))))
        return mesh(name, vertices, faces, surface, True)

    # The face has a separate jaw, pronounced cheeks and a shaped brow.
    skin_rows = [
        (-.219,.060,.101,.091), (-.203,.066,.149,.131), (-.181,.041,.183,.169),
        (-.149,.015,.215,.198), (-.115,-.006,.235,.218), (-.070,-.031,.254,.220),
        (-.036,-.034,.253,.213), (.006,-.032,.249,.215), (.055,-.046,.250,.219),
        (.100,-.064,.246,.207), (.152,-.070,.215,.176), (.178,-.083,.143,.129),
    ]
    def face_relief(y,z):
        nose = .032*exp(-(y/.047)**2-((z+.083)/.029)**2)
        bridge = .010*exp(-(y/.036)**2-((z+.039)/.046)**2)
        cheeks = .017*exp(-((abs(y)-.105)/.062)**2-((z+.101)/.055)**2)
        smiling_chin = .012*exp(-(y/.107)**2-((z+.179)/.035)**2)
        return nose + bridge + cheeks + smiling_chin

    def skin_x(y, z):
        for lower, upper in zip(skin_rows, skin_rows[1:]):
            if lower[0] <= z <= upper[0]:
                t = (z - lower[0]) / (upper[0] - lower[0])
                x, a, b = [p*(1-t)+q*t for p, q in zip(lower[1:], upper[1:])]
                return x + a * max(.05, 1 - (y/b)**2)**.5 + face_relief(y,z)
        return .17

    def sculpted_face():
        rows = [
            tuple(a + (b-a)*step/4 for a,b in zip(lower,upper))
            for lower,upper in zip(skin_rows,skin_rows[1:]) for step in range(4)
        ] + [skin_rows[-1]]
        head = rings('Face | round cheeks and soft connected nose',rows,'SKIN',48)
        for vertex in head.data.vertices:
            x,y,z = vertex.co
            center = rows[vertex.index//48][1]
            influence = min(1,max(0,(x-center)/.087))
            vertex.co.x += influence*face_relief(y,z)
        head.data.update()
        head['surfaces'] = [surfaces['SKIN'],surfaces['FACE_TONE']]
        head.data.materials.append(None)
        head.data.materials.append(None)
        head['keep_uv'] = True
        uv = head.data.uv_layers.new(name='Soft cheek pigment')
        for polygon in head.data.polygons:
            if polygon.normal.x > .24:
                polygon.material_index = 1
            for loop in polygon.loop_indices:
                _, y, z = head.data.vertices[head.data.loops[loop].vertex_index].co
                uv.data[loop].uv = ((y+.238)/.476,(z+.219)/.397)
        return head

    def face_feature(name, points, surface, bulge=.013, offset=.002):
        if sum(y*nz - ny*z for (y,z),(ny,nz) in zip(points, points[1:]+points[:1])) < 0:
            points = points[::-1]
        outline = [(skin_x(y,z) + offset,y,z) for y,z in points]
        y = sum(point[0] for point in points)/len(points)
        z = sum(point[1] for point in points)/len(points)
        n = len(points)
        return mesh(name, outline + [(skin_x(y,z) + offset + bulge,y,z)],
                    [(i,(i+1)%n,n) for i in range(n)], surface, True)

    def makeup_line(name, points, width, surface, offset=.009):
        return route(name, [(skin_x(y,z)+offset,y,z) for y,z in points], width, surface, 5)

    # Off-white and red-orange shell share the same topology at the moving seam.
    crown = [
        (.066,-.018,.294,.263), (.090,-.028,.303,.275), (.146,-.047,.299,.273),
        (.208,-.054,.269,.249), (.261,-.055,.218,.197), (.307,-.052,.135,.115),
        (.324,-.047,.043,.035),
    ]
    crown_sides = 60
    cap = rings('Safety helmet | continuous segmented paint', crown, 'IVORY', crown_sides)
    cap['surfaces'] = [surfaces['IVORY'], surfaces['ORANGE']]
    for name in ('Ivory', 'Signal orange'):
        cap.data.materials.append(bpy.data.materials.new(name))
    for poly in cap.data.polygons:
        if 1 <= poly.index < len(cap.data.polygons)-1:
            angle = (poly.index-1) % crown_sides
            poly.material_index = 1 if 47 <= angle <= 57 else 0
    brim = rings('Helmet | rolled protective lip', [
        (.049,.011,.312,.286), (.061,.013,.329,.298), (.071,.009,.329,.299), (.082,.001,.311,.286),
    ], 'IVORY_EDGE', 32)

    def mold_rib(lateral, low, high):
        points = []
        for i in range(15):
            x = low + i * (high - low) / 14
            for lower, upper in reversed(list(zip(crown, crown[1:]))):
                bottom, c, a, b = lower
                top, uc, ua, ub = upper
                if ((x-c)/a)**2 + (lateral/b)**2 > 1:
                    continue
                l, r = bottom, top
                for _ in range(11):
                    z = (l+r)*.5
                    t = (z-bottom)/(top-bottom)
                    c1, a1, b1 = (c+(uc-c)*t, a+(ua-a)*t, b+(ub-b)*t)
                    if ((x-c1)/a1)**2 + (lateral/b1)**2 <= 1:
                        l = z
                    else:
                        r = z
                points.append((x,l+.002,lateral))
                break
        return [(x,y,z) for x,z,y in points]

    # The hair becomes an asymmetrical silhouette with rounded sculpted locks.
    hair = scalp_patch('Warm black scalloped hair cap', [
        (-.160,-.001,.198,.228), (-.116,-.026,.261,.246),
        (-.044,-.047,.286,.249), (.027,-.058,.291,.231),
        (.096,-.066,.265,.221), (.133,-.068,.216,.185),
    ], 'HAIR', 28)
    face = [
        sculpted_face(),
        hair, cap, brim,
        strand('Helmet center molding seam',mold_rib(.037,-.294,.218), .0052, 'IVORY_EDGE', 5),
        strand('Helmet vent molding seam',mold_rib(.145,-.259,.171), .0044, 'IVORY_EDGE', 5),
        makeup_line('Confident closed smile',[(-.067,-.136),(-.051,-.148),(-.025,-.154),(.002,-.156),
                                              (.035,-.152),(.052,-.144),(.069,-.129)],
                    .0037,'LIP',.003),
        lock('Asymmetrical left sweep',[(.132,-.147,.092),(.188,-.109,.088),(.231,-.063,.077),(.237,-.054,.032),
                                         (.221,-.070,-.002),(.222,-.083,-.012)],
             [(.055,.027),(.064,.028),(.054,.030),(.035,.026),(.019,.014),(.003,.004)],'HAIR'),
        lock('Asymmetrical right sweep',[(.133,.143,.106),(.192,.092,.103),(.225,.041,.095),(.224,.019,.053),
                                          (.208,.036,.010),(.213,.073,.021)],
             [(.054,.023),(.061,.032),(.049,.031),(.033,.029),(.017,.014),(.002,.003)],'HAIR'),
    ]

    for side in (-1, 1):
        orbit_y = side * .103
        outline = [(orbit_y+y, z) for y,z in (
            (-.023,-.026),(-.018,-.017),(-.009,-.010),(.003,-.008),(.014,-.012),
            (.021,-.021),(.023,-.031),(.015,-.043),(.006,-.047),(-.006,-.046),(-.018,-.039))]
        face.append(face_feature(f'Small warm brown eye {side}',outline,'BROW',.003,.003))
        glint = [(orbit_y-.007+.0045*cos(i*pi/6),-.018+.0044*sin(i*pi/6)) for i in range(12)]
        face.append(face_feature(f'One warm catchlight {side}',glint,'EYE_WARM',.0008,.008))
        ear = rings(f'Rounded ear {side}',[
            (-.151,-.011,.026,.020),(-.129,.004,.041,.023),(-.096,.010,.043,.024),(-.065,-.001,.032,.022),
        ],'SKIN',10)
        ear.location.y = .198 * side
        face.extend([
            makeup_line(f'Soft raised brow {side}',[(orbit_y+y,z) for y,z in ((-.041,.018),(-.026,.031),
                (-.005,.037),(.021,.034),(.039,.025))], .0055,'BROW',.005),
            ear,
            lock(f'Framing cheek lock {side}',[(.020,.171*side,.071),(.087,.190*side,.021),
                  (.119,.205*side,-.057),(.127,.190*side,-.131),(.099,.178*side,-.179),(.062,.195*side,-.191)],
                 [(.065,.044),(.064,.037),(.047,.035),(.034,.030),(.020,.017),(.002,.003)],'HAIR'),
            lock(f'Side curl flick {side}',[(-.043,.217*side,.042),(.001,.250*side,-.036),
                  (-.039,.254*side,-.088),(-.072,.276*side,-.108),(-.113,.306*side,-.095)],
                 [(.031,.034),(.033,.028),(.029,.022),(.020,.013),(.003,.003)],'HAIR_HIGHLIGHT'),
            lock(f'Temple resolved hair ridge {side}',[(.125,.093*side,.108),(.136,.148*side,.079),
                  (.129,.182*side,.036),(.125,.205*side,-.021),(.144,.209*side,-.073)],
                 [(.020,.020),(.025,.018),(.022,.016),(.015,.014),(.003,.005)],'HAIR_HIGHLIGHT'),
            strand(f'Pigtail binder {side}',[(-.233,.169*side,-.081),(-.277,.185*side,-.107),
                    (-.278,.202*side,-.135),(-.237,.194*side,-.155)],.017,'ORANGE',7),
            lock(f'Low knot of pigtail {side}',[(-.258,.163*side,-.112),(-.295,.202*side,-.129),
                    (-.326,.233*side,-.156),(-.304,.271*side,-.209),(-.268,.280*side,-.229)],
                 [(.031,.038),(.061,.046),(.049,.044),(.033,.031),(.004,.005)],'HAIR'),
            lock(f'Long curled pigtail ends {side}',[(-.286,.220*side,-.132),(-.337,.257*side,-.153),
                    (-.352,.291*side,-.195),(-.318,.316*side,-.217),(-.285,.332*side,-.191)],
                 [(.035,.030),(.041,.036),(.036,.025),(.022,.019),(.003,.003)],'HAIR_HIGHLIGHT'),
            lock(f'Separated curl tips {side}',[(-.277,.205*side,-.154),(-.307,.246*side,-.191),
                    (-.322,.264*side,-.236),(-.290,.285*side,-.250),(-.267,.315*side,-.236)],
                 [(.027,.025),(.034,.028),(.031,.025),(.015,.011),(.003,.003)],'HAIR'),
        ])
        for i in range(3):
            inlet = side*(.019+i*.067)
            face.append(lock(f'Curved nape locks {side}.{i}',[
                (-.274,inlet,.066),(-.313,inlet+.029*side,.015),(-.320,inlet+.045*side,-.036),
                (-.301,inlet+.064*side,-.078),(-.272,inlet+.095*side,-.116),
            ],[(.019,.020),(.029,.016),(.030,.015),(.022,.015),(.003,.003)],'HAIR_HIGHLIGHT'))
        for f, (yy,zz) in enumerate(((.123,-.079),(.141,-.076),(.156,-.082),(.132,-.091),(.153,-.096))):
            y = yy*side
            face.append(face_feature(f'Freckle {side}.{f}',[(y+.0022*cos(k*pi/3),zz+.0021*sin(k*pi/3)) for k in range(6)],
                                    'FRECKLE',.0005,.0025))

    # Lantern and the flip-up eye shield live on opposite ends of the cap.
    lamp = [
        plate('Lantern side clamp',(0,0,0),(.014,.212,.093),'STEEL',.013),
        plate('Lantern rubber shock frame',(.040,0,0),(.097,.210,.142),'BLACK',.021),
        plate('Cast lantern case',(.072,0,0),(.072,.191,.125),'STEEL',.012),
        plate('Cream lantern seal',(.109,0,0),(.024,.160,.099),'ORANGE',.009),
        plate('Lantern inner chamfer surround',(.126,0,0),(.018,.142,.086),'GUNMETAL',.008),
        plate('Amber protective window',(.138,0,0),(.013,.127,.073),'LAMP',.005),
        lens('Bright circular optic',.144,0,0,.039,.030,.008,'EMIT',18),
        lens('Optic core',.151,0,0,.016,.014,.007,'TEETH',14),
        plate('Tool latch teal cinch',(.089,.099,0),(.053,.020,.088),'PETROL',.006),
        plate('Lantern top latch',(.058,0,.074),(.056,.059,.018),'IVORY_EDGE',.005),
    ]
    for side in (-1,1):
        for z in (-.034,.035):
            lamp.extend([
                lens('Captive lamp screw counterbore',.122,.079*side,z,.012,.010,.010,'TOOL_BLACK',10),
                lens('Captive lamp screw shoulder',.129,.079*side,z,.007,.006,.008,'TARNISH',8),
            ])
    for z in (-.040,-.018,.008,.035):
        lamp.append(plate('Cast lamp heat sink ribs',(.077,-.099,z),(.046,.014,.009),'WORN_PAINT',.003))
    visor = [
        plate('Lifted visor left hinge',(0,-.079,-.075),(.070,.038,.070),'STEEL',.007),
        plate('Lifted visor right hinge',(0,.079,-.075),(.070,.038,.070),'STEEL',.007),
        plate('Flipped single eye-shield edge',(.036,0,.015),(.046,.196,.157),'ORANGE',.012,.20),
        plate('Eye shield dark gasket',(.063,0,.016),(.024,.177,.140),'BLACK',.008,.20),
        plate('Eye shield retaining rim',(.078,0,.017),(.024,.162,.129),'TARNISH',.008,.20),
        plate('Raised safety glass',(.091,0,.017),(.020,.150,.113),'VISOR',.007,.20),
        plate('Safety glass diagonal bounce',(.104,-.033,.045),(.004,.012,.053),'VISOR_GLINT',.001,.20),
        lens('Eye shield tension keeper',.047,-.087,-.050,.019,.018,.033,'CUT_STEEL',12),
        lens('Eye shield tension keeper',.047,.087,-.050,.019,.018,.033,'CUT_STEEL',12),
    ]

    def mounted(objects, center, rotation):
        from mathutils import Euler
        rot = Euler(rotation, 'XYZ').to_matrix()
        for obj in objects:
            mat = rot.to_4x4()
            mat.translation = Vector(center) + rot @ obj.location
            obj.data.transform(mat)
            obj.location = (0,0,0)
        return objects

    face.extend(mounted(lamp,(.181,-.224,.157),(.08,-.25,-.53)))
    face.extend(mounted(visor,(.144,.218,.187),(.06,-.56,.59)))
    for x,y,z in ((.050,.285,.089),(-.222,-.198,.101),(-.252,.164,.091),(.201,-.162,.078)):
        face.append(plate('Helmet recessed hardware fastener',(x,y,z),(.038,.036,.028),'GUNMETAL',.005))
    for y in (-.115,-.065,.072,.121):
        face.extend([
            plate('Helmet rear vent bezel',(-.339,y,.121),(.016,.040,.029),'IVORY_EDGE',.004),
            plate('Helmet rear recessed vent',(-.350,y,.122),(.006,.031,.012),'TOOL_BLACK',.002),
        ])
    neck_anchor = Vector((0, 0, -.189))
    head_fit = Matrix.Translation(neck_anchor) @ Matrix.Scale(.90, 4) @ Matrix.Translation(-neck_anchor)
    for obj in face:
        obj.data.transform(head_fit)
        obj.location *= .90
    attach('Head',face)

    coat_rows = [
        (-.091,.009,.212,.218), (-.055,.013,.243,.247), (.078,.017,.261,.250),
        (.170,.017,.240,.228), (.251,.015,.257,.245), (.350,.021,.270,.279),
        (.444,.012,.244,.297), (.490,.012,.210,.275), (.535,.019,.163,.199), (.556,.019,.124,.136),
    ]
    coat = rings('Fitted night navy coverall jacket',coat_rows,'CANVAS',32)

    def seam_points(points, facing, allowance):
        shaped = []
        for y,z in points:
            for lower,upper in zip(coat_rows,coat_rows[1:]):
                if lower[0] <= z <= upper[0]:
                    t = (z-lower[0])/(upper[0]-lower[0])
                    center,a,b = [p+(q-p)*t for p,q in zip(lower[1:],upper[1:])]
                    x = center + facing*(a*max(.03,1-(y/b)**2)**.5 + allowance)
                    shaped.append((x,y,z))
                    break
        return shaped
    coat['surfaces'] = [surfaces['CANVAS'],surfaces['ORANGE'],surfaces['CANVAS_LIT']]
    for _ in range(3):
        coat.data.materials.append(None)
    for polygon in coat.data.polygons:
        if 1 <= polygon.index < len(coat.data.polygons)-1:
            segment = (polygon.index-1) % 32
            row = (polygon.index-1) // 32
            shoulder_or_back = 3 <= segment <= 28
            if row in (6,7) and shoulder_or_back:
                polygon.material_index = 1
    upper = [
        coat,
        rings('Neck',[(.520,.042,.105,.104),(.558,.045,.105,.093),
                     (.650,.055,.099,.095),(.682,.048,.101,.094)],'SKIN',20),
        rings('Standing reinforced collar',[(.507,.025,.154,.156),(.536,.025,.165,.154),
                                             (.576,.016,.120,.134),(.593,.015,.105,.118)],'DARK_CANVAS',20),
        panel('Visible undershirt',[ (.219,-.098,.516),(.267,-.055,.444),(.284,0,.420),
                                   (.267,.050,.443),(.219,.099,.513),(.205,.079,.548),(.208,-.081,.548)],
              .01,'IVORY_EDGE'),
        rings('Heavy woven tool belt',[
            (-.045,.018,.245,.245),(-.034,.023,.265,.257),(.043,.018,.268,.262),(.054,.018,.256,.252),
        ],'WEBBING',24),
        plate('Buckle body',(.292,-.074,.011),(.061,.158,.099),'STEEL',.014),
        plate('Buckle inset',(.327,-.074,.011),(.017,.103,.063),'BLACK',.006),
        plate('Buckle cross bar',(.340,-.074,.010),(.010,.069,.014),'CUT_STEEL',.002),
        plate('Bright belt keeper',(.266,.015,.010),(.041,.048,.100),'ORANGE',.011),
        route('Zipper channel',seam_points([(0,.051),(0,.130),(0,.222),(0,.295),(0,.392)],1,.003),.009,'DARK_CANVAS'),
        route('Thin stitched zipper teeth',seam_points([(0,.076),(0,.171),(0,.240),(0,.302),(0,.357)],1,.010),
              .003,'CUT_STEEL',5),
        plate('Large zipper pull',(.297,.010,.327),(.025,.042,.060),'CUT_STEEL',.005,-.18),
        plate('Tool reel harness chassis',(-.270,.175,.345),(.232,.350,.346),'WEBBING',.028,-.16),
        plate('Stamped offset reel saddle bracket',(-.403,.332,.469),(.267,.205,.129),'GUNMETAL',.024,.27),
        plate('Saddle bracket rib',(-.452,.354,.516),(.170,.052,.030),'TARNISH',.006,.20),
        plate('Diagonal belt webbing return',(-.233,.174,.042),(.102,.270,.084),'LEATHER',.017,-.08),
        route('Back jacket center seam',seam_points([(0,.475),(0,.444),(0,.383),(0,.292),(0,.196),(0,.084)],-1,.001),
              .0031,'STITCH',5),
    ]

    for side in (-1, 1):
        upper.extend([
            panel(f'Triangular open jacket lapel {side}',[
                (.273,.021*side,.451),(.248,.108*side,.468),(.190,.120*side,.543),
                (.205,.060*side,.559),(.249,.047*side,.486),
            ],.009,'CANVAS_LIT'),
            plate(f'Pocket panel {side}',(.238,.131*side,.302),(.091,.165,.151),'CANVAS_LIT',.019,-.09),
            plate(f'Visible pocket flap {side}',(.271,.131*side,.345),(.067,.169,.050),'ORANGE',.009,-.10),
            lens(f'Pocket dome snap {side}',.314,.138*side,.347,.013,.012,.012,'CUT_STEEL',10),
            route(f'Pocket stitch line {side}',[(.286,.070*side,.326),(.287,.071*side,.253),
                      (.291,.131*side,.237),(.287,.188*side,.253),(.286,.190*side,.320)],.0025,'STITCH',5),
            route(f'Back jacket shoulder topstitch {side}',seam_points([
                (.183*side,.492),(.201*side,.453),(.217*side,.393),
                (.213*side,.317),(.186*side,.232),(.166*side,.163),
            ],-1,.002),.0028,'STITCH',5),
        ])
    upper.append(panel('Teal lightning field patch', [
        (.297,-.137,.313),(.296,-.101,.311),(.300,-.124,.282),(.301,-.098,.282),
        (.300,-.157,.250),(.299,-.141,.281),(.300,-.163,.281),
    ],.0025,'PETROL'))
    def flat_strap(name, path, width, surface):
        vertices = []
        for i,point in enumerate(path):
            here = Vector(point)
            tangent = Vector(path[min(i+1,len(path)-1)])-Vector(path[max(i-1,0)])
            side = Vector((1,0,0)).cross(tangent).normalized() * width * .5
            vertices.extend(here + g*side + Vector((h,0,0)) for h,g in ((-.010,-1),(.010,-1),(.010,1),(-.010,1)))
        faces = [(3,2,1,0)]
        for row in range(len(path)-1):
            j = row*4
            faces.extend((j+i,j+(i+1)%4,j+(i+1)%4+4,j+i+4) for i in range(4))
        faces.append(tuple(range(len(vertices)-4,len(vertices))))
        return mesh(name,vertices,faces,surface)

    upper.extend([
        flat_strap('Diagonal reel harness across chest',[
            (.123,.223,.512),(.215,.210,.455),(.265,.157,.393),
            (.302,.080,.295),(.302,.011,.211),(.290,-.077,.139),(.279,-.163,.057),
        ],.077,'STRAP'),
        flat_strap('Diagonal reel harness back return',[
            (-.250,.250,.506),(-.305,.211,.321),(-.292,.102,.219),(-.288,-.033,.133),(-.235,-.153,.036),
        ],.072,'STRAP'),
        route('Harness right seam',[(.213,.176,.462),(.278,.130,.419),(.309,.069,.313),
                    (.310,-.024,.223),(.301,-.108,.138),(.286,-.191,.069)],.0027,'STITCH',5),
        route('Harness left seam',[(.201,.227,.449),(.267,.182,.385),(.313,.107,.291),
                    (.307,.023,.197),(.299,-.059,.127),(.280,-.126,.055)],.0027,'STITCH',5),
        plate('Metal strap buckle',(.292,.153,.386),(.049,.107,.062),'CUT_STEEL',.013,-.13),
        plate('Strap through buckle',(.322,.152,.384),(.016,.076,.034),'STRAP',.005,-.13),
        plate('Chest strap slider',(.312,.067,.273),(.030,.086,.039),'STEEL',.007,-.11),
        route('Side suspended steel carabiner',[(.289,-.145,.088),(.310,-.174,.066),(.316,-.182,.002),
                    (.314,-.159,-.042),(.302,-.131,-.011),(.312,-.127,.054),(.289,-.145,.088)],
              .009,'CUT_STEEL',7),
        plate('Carabiner gate',(.320,-.167,.016),(.017,.021,.064),'PETROL',.005),
        flat_strap('Orange tether keeper',[(.266,.052,.063),(.286,.062,.019),(.289,.060,-.065)],.043,'ORANGE'),
        route('Tether D ring',[(.293,.043,-.064),(.302,.029,-.085),(.303,.060,-.109),
                    (.297,.090,-.088),(.289,.079,-.063)],.008,'CUT_STEEL',6),
    ])

    # Holster has protruding insulated tools and a molded partly open pocket.
    holster = [
        plate('Orange tool holster body',(.004,0,-.009),(.125,.192,.196),'ORANGE',.026,-.16),
        plate('Dark pouch opening',(.023,0,.073),(.119,.174,.044),'BLACK',.006,-.16),
        plate('Leather holster facing strip',(.072,0,.027),(.027,.184,.041),'WEBBING',.006,-.16),
        plate('Holster bottom scuff guard',(.044,0,-.087),(.079,.176,.037),'ORANGE_EDGE',.008,-.16),
        plate('Long orange insulated driver',(.011,-.051,.120),(.046,.042,.132),'ORANGE',.014,.18),
        plate('Short petrol insulated driver',(.033,.011,.112),(.041,.038,.110),'PETROL',.012,-.10),
        plate('Petrol pull tab',(.006,.063,.093),(.045,.046,.106),'PETROL',.010,.18),
        plate('Holster snap',(.089,-.058,.025),(.014,.020,.023),'CUT_STEEL',.004),
        route('Salt colored holster seam',[(.070,-.071,-.009),(.082,-.069,-.063),(.083,0,-.079),
                    (.082,.069,-.060),(.070,.073,-.010)],.003,'STITCH',5),
    ]
    upper.extend(mounted(holster,(.153,-.248,.001),(-.16,.07,-.49)))
    upper.extend([
        plate('Other hip orange snap pouch',(.132,.255,.065),(.096,.112,.135),'ORANGE',.013,-.13),
        plate('Other hip pouch flap',(.174,.261,.098),(.060,.096,.043),'ORANGE_EDGE',.007,-.13),
    ])

    def annulus(name, x, min_r, max_r, width, surface, steps=32, center=(0,0)):
        yy,zz = center
        rows = ((x-width/2,min_r),(x-width/2,max_r-.009),(x-width*.35,max_r),
                (x+width*.35,max_r),(x+width/2,max_r-.009),(x+width/2,min_r))
        vertices = [(xx,yy+r*cos(i*2*pi/steps),zz+r*sin(i*2*pi/steps)) for xx,r in rows for i in range(steps)]
        faces = []
        for ring in range(len(rows)):
            for i in range(steps):
                a = ring*steps+i
                b = ring*steps+(i+1)%steps
                c = ((ring+1)%len(rows))*steps
                faces.append((a,b,c+(i+1)%steps,c+i))
        return mesh(name,vertices,faces,surface,True)

    def spoke(name, x, angle):
        pts = [(x,r*cos(angle+d),r*sin(angle+d)) for r,d in ((.082,-.69),(.268,-.25),
                                                                (.354,-.175),(.354,.175),(.268,.25),(.082,.69))]
        return panel(name,pts,.040,'GUNMETAL')

    # The petrol cable is one winding with its own section, end plug, and real holes between spokes.
    reel = []
    for side in (-1,1):
        x = .161*side
        outside = x + .027*side
        reel.extend([
            annulus(f'Spool forged flange {side}',x,.289,.391,.050,'GUNMETAL',44),
            annulus(f'Spool raised wear bead {side}',x-.015*side,.378,.395,.012,'TARNISH',36),
            annulus(f'Spool pressed inner roll {side}',outside,.286,.305,.009,'WORN_PAINT',36),
            annulus(f'Spool bearing ring {side}',x+side*.024,.078,.124,.019,'TARNISH',24),
            lens(f'Spool central hub {side}',x-.007*side,0,0,.117,.117,.107,'STEEL',20),
            lens(f'Spool hub inset {side}',x+.050*side,0,0,.069,.069,.037,'TOOL_BLACK',18),
            lens(f'Spool axle key washer {side}',x+.069*side,0,0,.043,.043,.023,'TARNISH',14),
            lens(f'Spool axle bolt {side}',x+.079*side,0,0,.027,.027,.022,'CUT_STEEL',8),
        ])
        for spoke_index in range(4):
            theta = .22 + spoke_index*pi/2
            reel.append(spoke(f'Stamped reel spoke {side}.{spoke_index}', x+.020, theta))
            for r in (.147,.344):
                y,z = r*cos(theta),r*sin(theta)
                reel.extend([
                    lens('Reel flush spoke pin recess',outside,y,z,.018,.018,.007,'TOOL_BLACK',10),
                    lens('Reel flush spoke pin',outside+.004*side,y,z,.009,.009,.010,'TARNISH',8),
                ])
            relief = [(outside+side*.006,r*cos(theta),r*sin(theta)) for r in (.188,.236,.283)]
            reel.append(strand('Spool stamped reinforcing bead',relief,.006,'GUNMETAL',6))
        for number in range(5):
            theta = .45+number*.30 if side < 0 else 3.53+number*.30
            ring = [(outside,.354*cos(theta-.037),.354*sin(theta-.037)),
                    (outside,.372*cos(theta-.031),.372*sin(theta-.031)),
                    (outside,.368*cos(theta+.034),.368*sin(theta+.034)),
                    (outside,.354*cos(theta+.032),.354*sin(theta+.032))]
            reel.append(panel('Pressed spool rim index mark',ring,.002,'TARNISH'))
    reel.append(lens('Reel winding hub',0,0,0,.239,.239,.327,'BLACK',28))
    cable = []
    turns = 6.1
    steps_per_turn = 22
    for i in range(int(turns*steps_per_turn) + 1):
        theta = (.22 + i / steps_per_turn) * 2 * pi
        cable.append((-.125 + .26*i/(turns*steps_per_turn), .303*cos(theta), .303*sin(theta)))
    reel.append(strand('Six helical turns of insulated petrol cable',cable,.025,'PETROL',7))
    reel.append(route('Hanging flexible output lead',[
        (.099,.262,.174),(.128,.339,.139),(.119,.367,.072),(.097,.372,-.077),(.094,.384,-.220),(.104,.376,-.283),
    ],.024,'PETROL',8))
    for row,z in enumerate((.142,.109,.074)):
        reel.append(rings(f'Ceramic triple isolation cleat {row}',[
            (z-.017,.113,.036,.037),(z-.009,.113,.050,.049),(z+.008,.113,.052,.050),(z+.015,.113,.040,.040),
        ],'IVORY',12))
        reel[-1].location.y = .365
    reel.extend([
        plate('Cable plug metal collar',(.103,.382,-.255),(.065,.073,.037),'GUNMETAL',.006),
        plate('Cable plug strain relief',(.104,.379,-.289),(.067,.073,.053),'STEEL',.008),
        plate('Cable plug silver nose',(.107,.379,-.317),(.042,.047,.025),'CUT_STEEL',.005),
        route('Cable keeper hook',[(.050,.299,.227),(.094,.313,.257),(.156,.321,.234),
                                   (.159,.345,.172),(.141,.370,.141)],.016,'ORANGE_EDGE',6),
    ])
    for z in (-.272,-.287,-.299):
        reel.append(plate('Cable plug rubber grip ridges',(.106,.380,z),
                          (.069,.074,.005),'TOOL_BLACK',.002))
    upper.extend(mounted(reel,(-.551,.418,.562),(-.22,-.13,-.24)))
    attach('Torso',upper)
