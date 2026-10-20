"""One illustration per project (800×500 SVG). Run render.py to write public/projects/*.svg."""
from art import *  # noqa: F401,F403

BG = {
    'Robotics': ('#E0ECFF', '#CFF5FB'),
    'IoT & Embedded': ('#E0F2FE', '#EDE9FE'),
    'Sensors & Safety': ('#FEF3C7', '#FFE4E6'),
    'AI & Advanced Systems': ('#0B1F44', '#1E3A8A'),
    'Sensors & Automation': ('#DCFCE7', '#E0F2FE'),
    'Interdisciplinary': ('#EDE9FE', '#FCE7F3'),
}


def frame(category, body, title):
    a, b = BG[category]
    dark = category == 'AI & Advanced Systems'
    dot = '#FFFFFF' if dark else '#0B1F44'
    return (f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 500' width='800' height='500' role='img' aria-label='{title}'>"
            f"<title>{title}</title><defs><linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'>"
            f"<stop offset='0' stop-color='{a}'/><stop offset='1' stop-color='{b}'/></linearGradient>"
            f"<pattern id='dots' width='24' height='24' patternUnits='userSpaceOnUse'><circle cx='2' cy='2' r='1.4' fill='{dot}' opacity='.08'/></pattern></defs>"
            f"<rect width='800' height='500' fill='url(#bg)'/><rect width='800' height='500' fill='url(#dots)'/>{body}</svg>")


def W(*pts, c='#F59E0B'):
    return wire(list(pts), c)


S = {}

# 1 Obstacle-avoiding robot
S['obstacle-avoiding-robot'] = (
    robot_car(190, 170, 1.15, 4, top=arduino_uno(40, 50, .5) + l298n(120, 54, .38) + battery(30, 112, .55))
    + hcsr04(450, 190, .85, rot=90)
    + waves(400, 255, 3, '#0EA5E9', 1, 50)
    + "<rect x='500' y='150' width='150' height='220' rx='10' fill='#B45309' stroke='#78350F' stroke-width='4'/>"
      "<path d='M500 200 H650 M500 260 H650 M500 320 H650' stroke='#92400E' stroke-width='3'/>"
    + label(250, 470, 'Arduino + L298N + 4WD') + label(410, 150, 'HC-SR04 at the front'))

# 2 Bluetooth robot
S['bluetooth-controlled-robot'] = (
    robot_car(90, 170, 1.1, 4, top=arduino_uno(40, 48, .5) + small_module(130, 60, .7, '#1D4ED8', 60, 36,
              text(30, 22, 'HC-05', 9, '#E0F2FE', 800))) +
    bluetooth(420, 230, 1.4) + "<path d='M360 230 h-30 M480 230 h30' stroke='#2563EB' stroke-width='4' stroke-dasharray='8 8'/>"
    + phone(560, 120, 1.25, "<circle cx='55' cy='70' r='18' fill='#2563EB'/><path d='M55 58 l-8 12 h16 Z' fill='#fff'/>"
            "<circle cx='55' cy='140' r='18' fill='#2563EB'/><path d='M55 152 l-8 -12 h16 Z' fill='#fff'/>"
            "<circle cx='22' cy='105' r='14' fill='#60A5FA'/><circle cx='88' cy='105' r='14' fill='#60A5FA'/>"
            "<circle cx='55' cy='105' r='12' fill='#EF4444'/>")
    + label(210, 470, 'HC-05 Bluetooth'))

# 3 Line follower
S['line-following-robot'] = (
    "<path d='M60 420 C200 420 220 300 360 300 S560 420 740 260' stroke='#111827' stroke-width='28' fill='none' stroke-linecap='round'/>"
    + robot_car(250, 120, 1, 2, top=arduino_uno(40, 30, .5) + l298n(118, 34, .36))
    + ir_sensor(300, 300, .9) + ir_sensor(380, 300, .9)
    + "<path d='M325 345 l0 30 M405 345 l0 30' stroke='#EF4444' stroke-width='3' stroke-dasharray='5 5'/>"
    + label(620, 120, '2 × IR sensors') + label(620, 152, 'DIY 2WD chassis'))

# 4 Servo robotic arm
S['servo-robotic-arm'] = (
    "<rect x='60' y='400' width='680' height='20' rx='6' fill='#94A3B8'/>"
    + robot_arm(300, 400, 1, -55, 70, 40, "<rect x='30' y='-10' width='22' height='20' fill='#F97316'/>")
    + arduino_uno(560, 250, .75)
    + W((570, 300), (470, 340), (330, 380), c='#F59E0B')
    + label(300, 455, '6 DoF Mini Arm', dark=True) + label(625, 380, 'Servo control'))

# 5 Omnidirectional robot
S['omnidirectional-robot'] = (
    smorphi(380, 260, 1.15)
    + "<path d='M590 260 h120 m-20 -16 l20 16 l-20 16' stroke='#2563EB' stroke-width='7' fill='none' stroke-linecap='round'/>"
    + "<path d='M380 100 v-60 m-16 20 l16 -20 l16 20' stroke='#2563EB' stroke-width='7' fill='none' stroke-linecap='round'/>"
    + "<path d='M150 150 a60 60 0 1 1 -10 80 m-6 -22 l6 22 l22 -6' stroke='#22D3EE' stroke-width='7' fill='none' stroke-linecap='round'/>"
    + label(380, 455, 'Mecanum wheels · holonomic drive'))

# 6 3D-printed chassis
S['3d-printed-robot-chassis'] = (
    printer3d(120, 110, 1.25, "<rect x='60' y='190' width='100' height='30' rx='4' fill='#F97316'/>"
              "<rect x='60' y='184' width='100' height='8' fill='#FB923C'/>")
    + robot_car(470, 170, .9, 2, top=arduino_uno(40, 30, .5) + l298n(118, 34, .36))
    + "<path d='M420 260 h-40' stroke='#F97316' stroke-width='6' stroke-dasharray='10 8'/>"
    + label(260, 465, '3D printer') + label(560, 360, 'Printed PLA chassis'))

# 7 Smart home
S['iot-smart-home-automation'] = (
    house(470, 150, 1.25, '#FFFFFF') + bulb(560, 290, .9, True) + bulb(680, 290, .9, False)
    + esp32(80, 170, 1.05) + relay_module(200, 330, .9, 4)
    + wifi(160, 120, 1.1) + W((165, 300), (230, 340)) + W((390, 365), (520, 330), c='#EF4444')
    + label(140, 470, 'ESP32') + label(320, 470, '4-ch relay'))

# 8 Smart irrigation
S['smart-irrigation-system'] = (
    plant_pot(560, 330, 1.25) + soil_probe(420, 280, .9)
    + arduino_uno(70, 180, .95) + relay_module(260, 320, .8, 1)
    + pump(250, 410, .9) + "<path d='M336 418 C450 418 470 330 520 290' stroke='#38BDF8' stroke-width='7' fill='none'/>"
    + "<circle cx='520' cy='310' r='6' fill='#38BDF8'/><circle cx='532' cy='330' r='5' fill='#38BDF8'/>"
    + W((230, 240), (420, 300)) + W((230, 270), (270, 340), c='#22C55E')
    + label(450, 260, 'Soil sensor') + label(150, 470, 'Arduino + relay + pump'))

# 9 Environmental station
S['environmental-monitoring-station'] = (
    esp32(110, 160, 1.15) + thermometer(320, 150, 1.0) + gas_sensor(390, 280, 1.1)
    + wifi(230, 110, 1) + screen_box(540, 120, 210, 250,
      chart(560, 170, 170, 80, [.4, .5, .45, .6, .55, .7, .65]) + text(645, 290, '27.4 °C', 26, '#0B1F44', 800)
      + text(645, 330, 'Air: OK', 16, '#16A34A', 700), 'Station')
    + label(160, 470, 'ESP32') + label(445, 470, 'MQ gas sensor'))

# 10 RFID access
S['rfid-access-control'] = (
    rfid_reader(90, 160, 1.15) + rfid_card(160, 70, .9, -14)
    + "<path d='M230 190 q20 20 0 40 M250 180 q30 30 0 60' stroke='#22D3EE' stroke-width='4' fill='none'/>"
    + lcd16x2(390, 110, 1.3, 'ACCESS', 'GRANTED')
    + "<rect x='450' y='270' width='190' height='170' rx='12' fill='#E2E8F0' stroke='#334155' stroke-width='4'/>"
    + servo(500, 340, 1.4, -70) + led(680, 300, '#22C55E', True, 1.4)
    + label(190, 470, 'RFID RC522') + label(545, 470, 'Servo latch'))

# 11 GSM alert
S['gsm-alert-system'] = (
    gsm_module(90, 180, 1.4) + arduino_uno(90, 330, .7)
    + small_module(300, 340, 1, '#F8FAFC', 70, 50, "<circle cx='35' cy='25' r='20' fill='#F1F5F9' stroke='#94A3B8'/>")
    + "<path d='M300 220 c60 -60 120 -60 180 -20' stroke='#22C55E' stroke-width='4' stroke-dasharray='8 8' fill='none'/>"
    + phone(520, 110, 1.35, "<rect x='10' y='40' width='90' height='36' rx='10' fill='#22C55E'/>" + text(55, 63, 'MOTION!', 11, '#FFFFFF', 800))
    + sms_bubble(330, 110, 'SMS alert')
    + label(175, 300, 'SIM800L') + label(335, 420, 'PIR'))

# 12 Flame alarm
S['fire-flame-detection-alarm'] = (
    flame(560, 320, 1.6) + "<rect x='530' y='330' width='60' height='90' rx='6' fill='#F8FAFC' stroke='#CBD5E1' stroke-width='3'/>"
    + small_module(270, 240, 1.3, '#1D4ED8', 90, 40, "<circle cx='14' cy='20' r='9' fill='#111827'/><rect x='34' y='12' width='22' height='16' fill='#2563EB'/>", rot=0)
    + "<path d='M400 265 h100' stroke='#EF4444' stroke-width='4' stroke-dasharray='8 8'/>"
    + arduino_uno(60, 230, .8) + buzzer(140, 140, 1.4) + led(240, 140, '#EF4444', True, 1.5)
    + waves(165, 140, 2, '#EF4444', 1, 30) + label(330, 320, 'Flame sensor') + label(150, 470, 'Buzzer + LED alarm'))

# 13 Smart walking stick
S['smart-walking-stick'] = (
    walking_stick(250, 100, 1.05)
    + "<rect x='290' y='140' width='60' height='60' rx='10' fill='#1E293B'/>" + text(320, 176, 'NANO', 10, '#E0F2FE', 800)
    + hcsr04(300, 350, .55, rot=90) + waves(345, 375, 3, '#0EA5E9', 1, 30)
    + "<rect x='560' y='220' width='120' height='230' rx='8' fill='#94A3B8'/>"
    + "<path d='M380 170 q20 -10 0 -20 M395 175 q30 -15 0 -30' stroke='#F59E0B' stroke-width='4' fill='none'/>"
    + label(150, 180, 'Buzzer + vibration') + label(240, 470, 'Ultrasonic at the tip'))

# 14 Fingerprint attendance
S['fingerprint-attendance-system'] = (
    fp_reader(90, 170, 1.6) + lcd16x2(430, 130, 1.25, 'ID 07 PRESENT', '09:12 20/10')
    + rtc_module(470, 310, 1.1) + W((350, 260), (430, 200)) + W((350, 290), (470, 350), c='#22C55E')
    + label(220, 470, 'Fingerprint sensor') + label(540, 450, 'DS3231 RTC'))

# 15 Heart rate
S['heart-rate-monitoring-prototype'] = (
    heart_sensor(170, 260, 1.6) + finger(150, 120, 1.0, 0)
    + heart(400, 150, 1.3) + ecg(300, 300, 220, '#EF4444', 5)
    + lcd16x2(470, 330, 1.05, 'PULSE  72 BPM', '')
    + label(170, 470, 'Pulse sensor') + label(610, 455, 'BPM display'))

# 16 Turbidity
S['water-turbidity-monitoring'] = (
    beaker(160, 210, 1.3, '#38BDF8', .35) + beaker(330, 210, 1.3, '#A16207', .55)
    + "<rect x='370' y='120' width='40' height='170' rx='12' fill='#111827'/><rect x='378' y='280' width='24' height='40' rx='4' fill='#1E293B'/>"
    + lcd16x2(520, 160, 1.0, 'TURBIDITY 68%', 'CLOUDY')
    + label(230, 470, 'Clear sample') + label(400, 470, 'Turbidity probe'))

# 17 AI object detection
S['ai-object-detection'] = (
    jetson(60, 250, 1.0) + depth_cam(80, 170, 1.0)
    + "<rect x='330' y='80' width='420' height='300' rx='10' fill='#0F172A' stroke='#334155' stroke-width='4'/>"
    + "<rect x='345' y='95' width='390' height='270' fill='#1E293B'/>"
    + "<circle cx='450' cy='240' r='60' fill='#F59E0B'/><rect x='560' y='170' width='130' height='160' rx='14' fill='#64748B'/>"
    + bbox(380, 170, 140, 140, 'ball 0.92') + bbox(550, 160, 150, 180, 'robot 0.87', '#22D3EE')
    + label(160, 470, 'Jetson Nano + Intel camera', dark=True))

# 18 Stereo depth
S['stereo-vision-depth-mapping'] = (
    stereo_cam(60, 80, 1.1)
    + "<defs><linearGradient id='depth' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#F97316'/>"
      "<stop offset='.4' stop-color='#FACC15'/><stop offset='.7' stop-color='#22C55E'/><stop offset='1' stop-color='#1E3A8A'/></linearGradient></defs>"
    + "<rect x='380' y='170' width='380' height='260' rx='10' fill='url(#depth)'/>"
    + "<path d='M380 430 L470 300 L540 360 L620 240 L760 330 V430 Z' fill='#0B1F44' opacity='.35'/>"
    + "<path d='M120 160 L380 200 M330 160 L380 400' stroke='#22D3EE' stroke-width='2' stroke-dasharray='6 6'/>"
    + label(220, 470, 'ZED-2 stereo camera', dark=True) + label(570, 155, 'Depth map', dark=True))

# 19 LiDAR mapping
S['lidar-mapping-navigation'] = (
    "<rect x='60' y='60' width='680' height='380' rx='12' fill='#0F172A' opacity='.55'/>"
    + "<path d='M110 100 H460 V200 H690 V400 H110 Z' fill='none' stroke='#22D3EE' stroke-width='5'/>"
    + "<rect x='160' y='140' width='80' height='60' fill='#22D3EE' opacity='.6'/><rect x='540' y='300' width='90' height='60' fill='#22D3EE' opacity='.6'/>"
    + lidar(330, 290, 1.1)
    + "<path d='M330 290 C420 300 460 360 560 260' stroke='#FACC15' stroke-width='4' stroke-dasharray='10 8' fill='none'/>"
    + label(330, 470, '2D LiDAR + SLAM map', dark=True))

# 20 Drone telemetry
S['drone-telemetry-control'] = (
    drone(260, 230, 1.15)
    + screen_box(500, 90, 250, 300, chart(515, 150, 220, 80, [.5, .55, .52, .6, .58, .62, .6], '#22D3EE')
      + text(625, 280, 'ROLL  1.2°', 16, '#0B1F44', 800, mono=True) + text(625, 310, 'PITCH -0.8°', 16, '#0B1F44', 800, mono=True)
      + text(625, 340, 'BATT 11.9 V', 16, '#16A34A', 800, mono=True), 'Telemetry')
    + "<path d='M380 170 q60 -40 120 -40' stroke='#22D3EE' stroke-width='4' stroke-dasharray='8 8' fill='none'/>"
    + label(260, 470, 'C-DAC drone kit', dark=True))

# 21 Parking assistant
S['smart-parking-assistant'] = (
    "<rect x='60' y='380' width='680' height='14' fill='#94A3B8'/><rect x='640' y='120' width='40' height='260' fill='#64748B'/>"
    + car(250, 270, 1.3) + hcsr04(560, 230, .55, rot=90) + waves(560, 260, 3, '#0EA5E9', -1, 40)
    + led(440, 160, '#22C55E', False, 1.3) + led(490, 160, '#FACC15', False, 1.3) + led(540, 160, '#EF4444', True, 1.3)
    + label(490, 210, 'Distance lights') + label(300, 470, 'Ultrasonic parking sensor'))

# 22 Automatic door
S['automatic-door-prototype'] = (
    "<rect x='300' y='110' width='240' height='300' fill='#E2E8F0' stroke='#334155' stroke-width='5'/>"
    + "<rect x='306' y='118' width='70' height='290' fill='#93C5FD' stroke='#1E3A8A' stroke-width='3'/>"
    + "<rect x='464' y='118' width='70' height='290' fill='#93C5FD' stroke='#1E3A8A' stroke-width='3'/>"
    + "<path d='M390 260 h-30 l12 -10 M450 260 h30 l-12 -10' stroke='#2563EB' stroke-width='5' fill='none'/>"
    + small_module(380, 70, .9, '#F8FAFC', 70, 40, "<circle cx='35' cy='20' r='15' fill='#F1F5F9' stroke='#94A3B8'/>")
    + servo(580, 200, 1.4, 40) + person(160, 410, 1.1, '#475569')
    + "<path d='M210 280 h60' stroke='#22D3EE' stroke-width='4' stroke-dasharray='8 8'/>"
    + label(420, 470, 'PIR sensor + SG90 servo'))

# 23 Gas leakage
S['gas-leakage-alert'] = (
    gas_sensor(140, 190, 1.6)
    + ''.join(f"<circle cx='{420 + i * 30}' cy='{170 + (i % 3) * 30}' r='{14 + (i % 2) * 6}' fill='#A3E635' opacity='.35'/>" for i in range(7))
    + "<path d='M560 300 l40 -70 l40 70 Z' fill='#FACC15' stroke='#A16207' stroke-width='4'/>" + text(600, 290, '!', 30, '#78350F', 900)
    + buzzer(620, 400, 1.2) + led(700, 410, '#EF4444', True, 1.3)
    + label(220, 470, 'MQ-series gas sensor') + label(640, 200, 'Alarm'))

# 24 Temperature-controlled fan
S['temperature-controlled-fan'] = (
    fan(560, 230, 1.15) + dc_motor(525, 380, .9) + thermometer(150, 140, 1.1, .82)
    + small_module(250, 330, 1.2, '#1D4ED8', 90, 50, chip(30, 14, 30, 22, 3) + text(45, 46, 'IRF520', 8, '#E0F2FE', 800))
    + "<path d='M300 160 h60 m-14 -10 l14 10 l-14 10' stroke='#EF4444' stroke-width='5' fill='none'/>"
    + label(150, 470, 'Temperature sensor') + label(330, 430, 'MOSFET PWM') + label(560, 470, 'DC fan'))

# 25 Light-activated lighting
S['light-activated-lighting'] = (
    "<rect x='420' y='60' width='340' height='380' rx='14' fill='#0B1F44'/>"
    + "<circle cx='700' cy='120' r='30' fill='#F8FAFC'/><circle cx='712' cy='110' r='30' fill='#0B1F44'/>"
    + "<circle cx='140' cy='120' r='46' fill='#FDE047'/>" + bulb(520, 300, 1.2, True) + bulb(640, 300, 1.2, True)
    + small_module(170, 260, 1.4, '#1D4ED8', 80, 44, "<circle cx='22' cy='22' r='12' fill='#FCA5A5' stroke='#B91C1C'/><path d='M14 22 h16' stroke='#7F1D1D' stroke-width='2'/>")
    + label(230, 360, 'LDR module') + label(580, 420, 'Lights on at dusk', dark=True))

# 26 Vibration monitoring
S['vibration-monitoring'] = (
    "<rect x='80' y='300' width='320' height='30' rx='6' fill='#94A3B8'/>"
    + mpu6050(110, 200, 1.1) + vib_motor(320, 260, 1.2)
    + "<path d='M290 240 l-10 -10 M350 240 l10 -10 M290 285 l-10 10 M350 285 l10 10' stroke='#F59E0B' stroke-width='4'/>"
    + screen_box(460, 110, 290, 260, "<polyline points='480,250 520,250 530,200 540,300 550,180 560,320 570,230 580,250 640,250 650,215 660,285 670,250 730,250' "
                                     "fill='none' stroke='#2563EB' stroke-width='3'/>", 'Acceleration')
    + label(170, 470, 'MPU-6050') + label(330, 470, 'Vibration motor'))

# 27 GPS
S['gps-tracking-prototype'] = (
    map_grid(400, 120, 340, 300)
    + "<path d='M400 300 C480 280 520 330 600 260 S700 200 740 220' stroke='#22C55E' stroke-width='10' fill='none' opacity='.5'/>"
    + pin(600, 270, 1.4) + satellite(180, 110, 1.2)
    + "<path d='M200 140 L230 250' stroke='#22D3EE' stroke-width='3' stroke-dasharray='6 6'/>"
    + gps_module(90, 270, 1.3) + label(210, 470, 'NEO-6M GPS') + label(570, 455, 'Live coordinates'))

# 28 Notice display
S['digital-notice-display'] = (
    "<rect x='90' y='70' width='620' height='300' rx='16' fill='#FFFFFF' stroke='#CBD5E1' stroke-width='3'/>"
    + lcd16x2(160, 130, 2.0, 'LAB OPEN 9-5', 'NEW: DRONE KIT')
    + ''.join(f"<circle cx='{330 + i * 140}' cy='{420}' r='26' fill='#1E293B'/><circle cx='{330 + i * 140}' cy='{420}' r='16' fill='#475569'/>" for i in range(2))
    + text(330, 470, 'PREV', 12, '#0B1F44', 800) + text(470, 470, 'NEXT', 12, '#0B1F44', 800))

# 29 Electronic dice
S['electronic-dice'] = (
    dice_face(300, 90, 1.5, 5)
    + "<circle cx='640' cy='380' r='38' fill='#1E293B'/><circle cx='640' cy='380' r='24' fill='#EF4444'/>"
    + text(640, 450, 'ROLL', 14, '#0B1F44', 800) + arduino_uno(70, 300, .8)
    + label(150, 280, 'Arduino Uno') + label(435, 470, '7 LEDs'))

# 30 Touch switch
S['touch-controlled-switch'] = (
    touch_pad(180, 230, 2.2) + finger(240, 60, 1.1, 0)
    + "<path d='M360 300 h120' stroke='#F59E0B' stroke-width='5'/>"
    + bulb(600, 280, 1.8, True) + label(260, 470, 'Touch sensor') + label(600, 470, 'Toggled light'))

# 31 Smart dustbin
S['smart-dustbin-prototype'] = (
    bin_(330, 210, 1.15, -38) + hcsr04(358, 300, .6) + servo(300, 180, 1.0, -60)
    + "<path d='M610 210 c-40 0 -90 20 -130 60' stroke='#0EA5E9' stroke-width='4' stroke-dasharray='8 8' fill='none'/>"
    + "<path d='M600 180 c30 -10 60 0 80 20 l-20 40 c-20 -10 -40 -10 -60 0 Z' fill='#F5C6A5' stroke='#C08457' stroke-width='3'/>"
    + label(420, 470, 'Ultrasonic + servo lid'))

# 32 Water level
S['water-level-indicator'] = (
    tank(250, 90, 220, 330, .62)
    + ''.join(f"<rect x='480' y='{130 + i * 90}' width='70' height='30' rx='4' fill='#1D4ED8'/>" for i in range(3))
    + led(620, 160, '#EF4444', False, 1.4) + led(620, 250, '#FACC15', True, 1.4) + led(620, 340, '#22C55E', True, 1.4)
    + buzzer(700, 160, .9) + label(360, 470, 'Wet/dry probes') + label(640, 420, 'Level LEDs'))

# 33 Wireless dashboard
S['wireless-sensor-dashboard'] = (
    esp32(90, 170, 1.1) + wifi(250, 150, 1.1)
    + laptop(380, 110, 1.3, chart(40, 30, 100, 50, [.3, .5, .4, .7, .6], '#2563EB') + chart(150, 30, 100, 50, [.6, .4, .5, .3, .5], '#F59E0B')
             + chart(40, 95, 210, 45, [.2, .3, .5, .4, .6, .7, .5, .8], '#22C55E'))
    + label(160, 470, 'ESP32 + sensors') + label(560, 470, 'Live web dashboard'))

# 34 Teleoperation
S['robot-teleoperation-dashboard'] = (
    laptop(60, 120, 1.15, "<circle cx='140' cy='55' r='18' fill='#2563EB'/><circle cx='140' cy='125' r='18' fill='#2563EB'/>"
                         "<circle cx='100' cy='90' r='18' fill='#2563EB'/><circle cx='180' cy='90' r='18' fill='#2563EB'/>"
                         "<rect x='200' y='120' width='46' height='22' rx='6' fill='#EF4444'/>")
    + wifi(440, 170, 1.1) + twin_bot(600, 300, 1.15)
    + "<path d='M440 210 C480 260 520 280 540 290' stroke='#2563EB' stroke-width='4' stroke-dasharray='8 8' fill='none'/>"
    + label(220, 470, 'Web control panel') + label(600, 470, 'Twin Bot'))

# 35 Pick-and-place
S['robotic-pick-and-place'] = (
    "<rect x='60' y='400' width='680' height='20' rx='6' fill='#94A3B8'/>"
    + "<rect x='120' y='370' width='120' height='30' fill='none' stroke='#2563EB' stroke-width='4' stroke-dasharray='8 6'/>"
    + "<rect x='560' y='370' width='120' height='30' fill='#22C55E' opacity='.25' stroke='#16A34A' stroke-width='4'/>"
    + "<rect x='590' y='340' width='40' height='30' fill='#F97316'/><rect x='636' y='350' width='28' height='20' fill='#2563EB'/>"
    + robot_arm(400, 400, .95, -110, 60, 70, "<rect x='30' y='-12' width='24' height='24' fill='#EAB308'/>")
    + "<path d='M180 330 C260 170 520 170 620 320' stroke='#0EA5E9' stroke-width='4' stroke-dasharray='10 8' fill='none'/>"
    + label(180, 460, 'Pick') + label(620, 460, 'Place'))

# 36 Assistive device
S['3d-printed-assistive-device'] = (
    printer3d(80, 110, 1.2, "<path d='M70 222 C70 180 150 180 150 222 Z' fill='#A855F7'/>")
    + "<rect x='470' y='200' width='70' height='200' rx='35' fill='#A855F7'/>"
    + ''.join(f"<rect x='{470}' y='{230 + i * 36}' width='70' height='10' rx='5' fill='#7E22CE'/>" for i in range(4))
    + "<rect x='495' y='110' width='20' height='100' rx='6' fill='#CBD5E1'/><ellipse cx='505' cy='88' rx='28' ry='38' fill='#CBD5E1' stroke='#94A3B8' stroke-width='3'/>"
    + label(220, 470, '3D printer') + label(600, 300, 'Easy-grip handle'))

# 37 RTC display
S['real-time-clock-display'] = (
    rtc_module(90, 160, 1.6) + lcd16x2(380, 140, 1.5, '  10:42:07', ' TUE 20-10-26')
    + "<circle cx='600' cy='390' r='50' fill='#FFFFFF' stroke='#0B1F44' stroke-width='5'/><path d='M600 390 V358 M600 390 L626 404' stroke='#0B1F44' stroke-width='5' stroke-linecap='round'/>"
    + W((300, 230), (380, 230)) + label(195, 470, 'DS3231 RTC') + label(560, 470, 'Time and date'))

# 38 Wireless heart-rate logger
S['wireless-heart-rate-logger'] = (
    heart_sensor(150, 330, 1.3) + finger(130, 190, .9) + esp32(260, 170, 1.0) + wifi(400, 150, 1)
    + laptop(450, 150, 1.0, "<polyline points='30,80 60,80 70,60 80,110 90,40 100,95 110,80 160,80 170,65 180,100 190,80 250,80' fill='none' stroke='#EF4444' stroke-width='3'/>"
             + text(140, 140, '74 BPM', 18, '#0B1F44', 800))
    + label(170, 470, 'Pulse sensor + ESP32') + label(590, 470, 'Logged in the browser'))

# 39 Waste segregation
S['smart-waste-segregation'] = (
    chute(170, 110, 1.4)
    + "<rect x='230' y='70' width='36' height='36' rx='6' fill='#A16207'/>"
    + ir_sensor(290, 180, .8) + soil_probe(370, 210, .4)
    + servo(420, 260, 1.3, 25)
    + "<path d='M250 330 H360 L350 440 H260 Z' fill='#16A34A' stroke='#14532D' stroke-width='3'/>" + text(305, 395, 'WET', 16, '#FFFFFF', 800)
    + "<path d='M520 330 H630 L620 440 H530 Z' fill='#2563EB' stroke='#1E3A8A' stroke-width='3'/>" + text(575, 395, 'DRY', 16, '#FFFFFF', 800)
    + label(680, 150, 'IR + moisture probe') + label(680, 190, 'Servo flaps'))

# 40 Indoor localization
S['indoor-robot-localization'] = (
    floorplan(90, 80, 620, 340)
    + ''.join(f"<circle cx='{300 + (i * 37) % 90 - 45}' cy='{250 + (i * 53) % 70 - 35}' r='4' fill='#22D3EE' opacity='.7'/>" for i in range(24))
    + twin_bot(300, 250, .55) + lidar(300, 230, .5, True)
    + "<circle cx='300' cy='250' r='70' fill='none' stroke='#2563EB' stroke-width='3' stroke-dasharray='8 6'/>"
    + label(400, 465, 'Robot pose estimate on the map'))
