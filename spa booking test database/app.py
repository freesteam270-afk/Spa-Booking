# app.py - ระบบจองสปา (Flask + SQLite)
# ใช้ SQLAlchemy ORM แทนการอ่านเขียนไฟล์ JSON

from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from functools import wraps
from datetime import datetime, timedelta
import json
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', '11481148qweR!')

# --- ตั้งค่า Database (แบบรองรับ SQLite) ---
# ค้นหา Path ที่แท้จริงของไฟล์ app.py
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# กำหนดให้สร้างไฟล์ .db ในโฟลเดอร์ instance
INSTANCE_PATH = os.path.join(BASE_DIR, 'instance')
os.makedirs(INSTANCE_PATH, exist_ok=True)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(INSTANCE_PATH, 'spa_booking.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'd7f8e9a1b2c3d4e5f6a7b8c')
db = SQLAlchemy(app)
migrate = Migrate(app, db)

# ============================================
# Models (โครงสร้างตาราง)
# ============================================

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.String, primary_key=True)          # 'u1', 'u2'
    username = db.Column(db.String, unique=True, nullable=False)
    password = db.Column(db.String, nullable=False)
    role = db.Column(db.String, nullable=False)          # 'admin', 'staff'
    fullname = db.Column(db.String)

    bookings = db.relationship('Booking', backref='staff', lazy=True)
    attendances = db.relationship('Attendance', backref='staff', lazy=True)

class Package(db.Model):
    __tablename__ = 'packages'
    id = db.Column(db.String, primary_key=True)          # 'p1', 'p2'
    name = db.Column(db.String, nullable=False)

    bookings = db.relationship('Booking', backref='package', lazy=True)

class Booking(db.Model):
    __tablename__ = 'bookings'
    id = db.Column(db.String, primary_key=True)
    date = db.Column(db.Date, nullable=False, index=True)
    start_time = db.Column(db.Time, nullable=False)
    end_time = db.Column(db.Time, nullable=False)
    customer_name = db.Column(db.String, nullable=False)
    room_number = db.Column(db.String)
    customer_gender = db.Column(db.String, nullable=False)
    duration_minutes = db.Column(db.Integer, nullable=False)
    price = db.Column(db.Integer, nullable=False)
    note = db.Column(db.Text)
    guest_type = db.Column(db.String, nullable=False)

    staff_id = db.Column(db.String, db.ForeignKey('users.id'), nullable=False)
    package_id = db.Column(db.String, db.ForeignKey('packages.id'), nullable=False)

class Attendance(db.Model):
    __tablename__ = 'staff_attendance'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    staff_id = db.Column(db.String, db.ForeignKey('users.id'), nullable=False)
    date = db.Column(db.Date, nullable=False, index=True)
    checkin_time = db.Column(db.Time, nullable=False)
    checkout_time = db.Column(db.Time, nullable=False)
    status = db.Column(db.String, nullable=False)   # 'working', 'left'

    __table_args__ = (db.UniqueConstraint('staff_id', 'date', name='_staff_date_uc'),)

# ============================================
# ฟังก์ชันช่วยเหลือ (Migrate JSON to SQLite)
# ============================================

def read_json(filename):
    """อ่านข้อมูลจากไฟล์ JSON ในโฟลเดอร์ data/"""
    filepath = os.path.join('data', filename)
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def migrate_from_json():
    """ย้ายข้อมูลจากไฟล์ JSON ไปยังฐานข้อมูล SQLite หากตารางยังว่าง"""
    # ตรวจสอบว่ามีข้อมูลอยู่แล้วหรือไม่
    if User.query.first() is not None:
        print("✅ ฐานข้อมูลมีข้อมูลแล้ว ไม่ต้องย้าย")
        return

    print("🔄 กำลังย้ายข้อมูลจาก JSON ไปยัง SQLite...")
    # 1. Users
    users_data = read_json('users.json').get('users', [])
    for u in users_data:
        if not User.query.get(u['id']):
            user = User(
                id=u['id'],
                username=u['username'],
                password=u['password'],
                role=u['role'],
                fullname=u['fullname']
            )
            db.session.add(user)
    db.session.commit()
    print("✅ ย้าย Users สำเร็จ")

    # 2. Packages
    packages_data = read_json('packages.json').get('packages', [])
    for p in packages_data:
        if not Package.query.get(p['id']):
            pkg = Package(
                id=p['id'],
                name=p['name']
            )
            db.session.add(pkg)
    db.session.commit()
    print("✅ ย้าย Packages สำเร็จ")

    # 3. Bookings
    bookings_data = read_json('bookings.json').get('bookings', [])
    for b in bookings_data:
        if not Booking.query.get(b['id']):
            booking = Booking(
                id=b['id'],
                date=datetime.strptime(b['date'], '%Y-%m-%d').date(),
                start_time=datetime.strptime(b['start_time'], '%H:%M').time(),
                end_time=datetime.strptime(b['end_time'], '%H:%M').time(),
                customer_name=b['customer_name'],
                room_number=b.get('room_number', ''),
                customer_gender=b.get('customer_gender', 'other'),
                duration_minutes=b['duration_minutes'],
                price=b['price'],
                note=b.get('note', ''),
                guest_type=b.get('guest_type', 'outside'),
                staff_id=b['staff_id'],
                package_id=b['package_id']
            )
            db.session.add(booking)
    db.session.commit()
    print("✅ ย้าย Bookings สำเร็จ")

    # 4. Attendance
    attendance_data = read_json('staff_attendance.json').get('attendance', [])
    for a in attendance_data:
        exist = Attendance.query.filter_by(staff_id=a['staff_id'], date=datetime.strptime(a['date'], '%Y-%m-%d').date()).first()
        if not exist:
            att = Attendance(
                staff_id=a['staff_id'],
                date=datetime.strptime(a['date'], '%Y-%m-%d').date(),
                checkin_time=datetime.strptime(a.get('checkin_time', '09:00'), '%H:%M').time(),
                checkout_time=datetime.strptime(a.get('checkout_time', '18:00'), '%H:%M').time(),
                status=a.get('status', 'working')
            )
            db.session.add(att)
    db.session.commit()
    print("✅ ย้าย Staff Attendance สำเร็จ")
    print("🎉 ย้ายข้อมูลทั้งหมดเสร็จสมบูรณ์")

# ============================================
# Decorators
# ============================================

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        if session.get('role') != 'admin':
            return "ไม่มีสิทธิ์", 403
        return f(*args, **kwargs)
    return decorated_function

# ============================================
# หน้าเว็บ (เหมือนเดิม)
# ============================================

@app.route('/')
def index():
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        user = User.query.filter_by(username=username, password=password).first()
        if user:
            session['user_id'] = user.id
            session['username'] = user.username
            session['role'] = user.role
            session['fullname'] = user.fullname
            return redirect(url_for('booking_chart'))
        return render_template('login.html', error="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/booking_chart')
@login_required
def booking_chart():
    return render_template('booking_chart.html',
                         username=session.get('username'),
                         fullname=session.get('fullname'),
                         role=session.get('role'))

@app.route('/staff_management')
@login_required
def staff_management():
    return render_template('staff_management.html',
                         username=session.get('username'),
                         fullname=session.get('fullname'),
                         role=session.get('role'))

@app.route('/admin')
@admin_required
def admin_page():
    return render_template('admin.html',
                         username=session.get('username'),
                         fullname=session.get('fullname'),
                         role=session.get('role'))

# ============================================
# API: พนักงาน
# ============================================

@app.route('/api/staff_list')
@login_required
def api_staff_list():
    date_str = request.args.get('date')
    if not date_str:
        date_str = datetime.now().strftime('%Y-%m-%d')
    try:
        target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'error': 'Invalid date format'}), 400

    staff_users = User.query.filter_by(role='staff').all()
    # ดึง attendance ของวันนั้น
    att_records = Attendance.query.filter_by(date=target_date).all()
    att_map = {att.staff_id: att for att in att_records}

    staff_list = []
    for user in staff_users:
        att = att_map.get(user.id)
        is_checked_in = (att is not None and att.status == 'working')
        staff_list.append({
            'id': user.id,
            'name': user.fullname,
            'username': user.username,
            'is_checked_in': is_checked_in,
            'checkin_time': att.checkin_time.strftime('%H:%M') if att else None,
            'checkout_time': att.checkout_time.strftime('%H:%M') if att else None
        })
    return jsonify(staff_list)

@app.route('/api/attendance/checkin', methods=['POST'])
@login_required
def api_checkin():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'ไม่พบข้อมูล'}), 400
        staff_id = data.get('staff_id')
        checkin_time = data.get('checkin_time')
        checkout_time = data.get('checkout_time')
        if not staff_id or not checkin_time or not checkout_time:
            return jsonify({'success': False, 'error': 'ข้อมูลไม่ครบ'}), 400

        today = datetime.now().date()
        att = Attendance.query.filter_by(staff_id=staff_id, date=today).first()
        if att:
            att.checkin_time = datetime.strptime(checkin_time, '%H:%M').time()
            att.checkout_time = datetime.strptime(checkout_time, '%H:%M').time()
            att.status = 'working'
        else:
            att = Attendance(
                staff_id=staff_id,
                date=today,
                checkin_time=datetime.strptime(checkin_time, '%H:%M').time(),
                checkout_time=datetime.strptime(checkout_time, '%H:%M').time(),
                status='working'
            )
            db.session.add(att)
        db.session.commit()
        return jsonify({'success': True, 'message': 'เช็คอินสำเร็จ'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/attendance/checkout', methods=['POST'])
@login_required
def api_checkout():
    data = request.json
    today = datetime.now().date()
    att = Attendance.query.filter_by(staff_id=data['staff_id'], date=today).first()
    if att:
        att.status = 'left'
        db.session.commit()
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'ไม่พบข้อมูลการเช็คอิน'}), 404

# ============================================
# API: การจอง
# ============================================

@app.route('/api/bookings', methods=['GET'])
@login_required
def api_get_bookings():
    date_str = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    bookings_query = Booking.query.filter_by(date=target_date).all()

    # สร้าง package map สำหรับ name
    packages = Package.query.all()
    package_map = {p.id: p for p in packages}

    result = []
    for b in bookings_query:
        pkg = package_map.get(b.package_id)
        result.append({
            'id': b.id,
            'date': b.date.isoformat(),
            'start_time': b.start_time.strftime('%H:%M'),
            'end_time': b.end_time.strftime('%H:%M'),
            'staff_id': b.staff_id,
            'customer_name': b.customer_name,
            'room_number': b.room_number,
            'customer_gender': b.customer_gender,
            'package_id': b.package_id,
            'duration_minutes': b.duration_minutes,
            'price': b.price,
            'note': b.note,
            'guest_type': b.guest_type,
            'package_name': pkg.name if pkg else 'ไม่พบแพ็กเกจ'
        })
    return jsonify(result)

@app.route('/api/bookings', methods=['POST'])
@login_required
def api_create_booking():
    data = request.json
    # ตรวจสอบ package
    pkg = Package.query.get(data['package_id'])
    if not pkg:
        return jsonify({'success': False, 'error': 'ไม่พบแพ็กเกจ'}), 400

    # รับ duration และ price จาก request (ต้องมีค่า)
    duration = data.get('duration_minutes')
    price = data.get('price')
    if duration is None or price is None:
        return jsonify({'success': False, 'error': 'กรุณาระบุระยะเวลาและราคา'}), 400
    duration = int(duration)
    price = int(price)

    start_time = datetime.strptime(data['start_time'], '%H:%M')
    end_time = start_time + timedelta(minutes=duration)

    # สร้าง ID ใหม่ (b ตามลำดับ)
    last_booking = Booking.query.order_by(Booking.id.desc()).first()
    if last_booking:
        last_num = int(last_booking.id[1:])
        new_id = f"b{last_num + 1}"
    else:
        new_id = "b1"

    new_booking = Booking(
        id=new_id,
        date=datetime.strptime(data['date'], '%Y-%m-%d').date(),
        start_time=start_time.time(),
        end_time=end_time.time(),
        staff_id=data['staff_id'],
        customer_name=data['customer_name'],
        room_number=data.get('room_number', ''),
        customer_gender=data.get('customer_gender', 'other'),
        package_id=data['package_id'],
        duration_minutes=duration,
        price=price,
        note=data.get('note', ''),
        guest_type=data.get('guest_type', 'outside')
    )
    db.session.add(new_booking)
    db.session.commit()

    return jsonify({'success': True, 'booking': {
        'id': new_booking.id,
        'date': new_booking.date.isoformat(),
        'start_time': new_booking.start_time.strftime('%H:%M'),
        'end_time': new_booking.end_time.strftime('%H:%M'),
        'staff_id': new_booking.staff_id,
        'customer_name': new_booking.customer_name,
        'room_number': new_booking.room_number,
        'customer_gender': new_booking.customer_gender,
        'package_id': new_booking.package_id,
        'duration_minutes': new_booking.duration_minutes,
        'price': new_booking.price,
        'note': new_booking.note,
        'guest_type': new_booking.guest_type
    }})

@app.route('/api/bookings/<booking_id>', methods=['PUT'])
@login_required
def api_update_booking(booking_id):
    booking = Booking.query.get(booking_id)
    if not booking:
        return jsonify({'success': False, 'error': 'ไม่พบการจอง'}), 404

    data = request.json
    # อัปเดตฟิลด์ที่ได้รับมา
    if 'customer_name' in data:
        booking.customer_name = data['customer_name']
    if 'room_number' in data:
        booking.room_number = data['room_number']
    if 'customer_gender' in data:
        booking.customer_gender = data['customer_gender']
    if 'package_id' in data:
        booking.package_id = data['package_id']
    if 'staff_id' in data:
        booking.staff_id = data['staff_id']
    if 'start_time' in data:
        booking.start_time = datetime.strptime(data['start_time'], '%H:%M').time()
    if 'date' in data:
        booking.date = datetime.strptime(data['date'], '%Y-%m-%d').date()
    if 'note' in data:
        booking.note = data['note']
    if 'guest_type' in data:
        booking.guest_type = data['guest_type']
    if 'duration_minutes' in data:
        booking.duration_minutes = int(data['duration_minutes'])
        # คำนวณ end_time ใหม่
        start_dt = datetime.combine(booking.date, booking.start_time)
        end_dt = start_dt + timedelta(minutes=booking.duration_minutes)
        booking.end_time = end_dt.time()
    if 'price' in data:
        booking.price = int(data['price'])

    db.session.commit()
    return jsonify({'success': True, 'booking': {'id': booking.id}})

@app.route('/api/bookings/<booking_id>', methods=['DELETE'])
@login_required
def api_delete_booking(booking_id):
    booking = Booking.query.get(booking_id)
    if not booking:
        return jsonify({'success': False, 'error': 'ไม่พบการจอง'}), 404
    db.session.delete(booking)
    db.session.commit()
    return jsonify({'success': True})

# ============================================
# API: สรุปพนักงานรายวัน
# ============================================

@app.route('/api/staff_summary')
@login_required
def api_staff_summary():
    date_str = request.args.get('date')
    if not date_str:
        date_str = datetime.now().strftime('%Y-%m-%d')
    try:
        target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'error': 'Invalid date format'}), 400

    # พนักงานที่เช็คอิน (status=working) ในวันนั้น
    attended_staff = db.session.query(Attendance.staff_id).filter(
        Attendance.date == target_date,
        Attendance.status == 'working'
    ).all()
    staff_ids = [s[0] for s in attended_staff]

    summary = []
    for staff_id in staff_ids:
        staff = User.query.get(staff_id)
        if staff and staff.role == 'staff':
            staff_bookings = Booking.query.filter_by(date=target_date, staff_id=staff_id).all()
            total_minutes = sum(b.duration_minutes for b in staff_bookings)
            summary.append({
                'staff_id': staff.id,
                'name': staff.fullname,
                'total_bookings': len(staff_bookings),
                'total_minutes': total_minutes
            })
    return jsonify(summary)

# ============================================
# API: แพ็กเกจ (เฉพาะชื่อ ไม่มี duration/price)
# ============================================

@app.route('/api/packages')
@login_required
def api_get_packages():
    packages = Package.query.all()
    return jsonify([{'id': p.id, 'name': p.name} for p in packages])

# ============================================
# API: Admin (Users & Packages)
# ============================================

@app.route('/api/admin/users', methods=['GET'])
@admin_required
def api_admin_users_get():
    users = User.query.all()
    safe_users = [{'id': u.id, 'username': u.username, 'role': u.role, 'fullname': u.fullname} for u in users]
    return jsonify(safe_users)

@app.route('/api/admin/users', methods=['POST'])
@admin_required
def api_admin_users_post():
    data = request.json
    # หา id ล่าสุด
    last_user = User.query.order_by(User.id.desc()).first()
    if last_user:
        last_num = int(last_user.id[1:])
        new_id = f"u{last_num + 1}"
    else:
        new_id = "u1"
    new_user = User(
        id=new_id,
        username=data['username'],
        password=data['password'],
        role=data['role'],
        fullname=data['fullname']
    )
    db.session.add(new_user)
    db.session.commit()
    return jsonify({'success': True, 'user': {
        'id': new_user.id,
        'username': new_user.username,
        'role': new_user.role,
        'fullname': new_user.fullname
    }})

@app.route('/api/admin/users', methods=['DELETE'])
@admin_required
def api_admin_users_delete():
    user_id = request.args.get('user_id')
    user = User.query.get(user_id)
    if user:
        # ลบ attendance และ bookings ของ user นี้ก่อน
        Attendance.query.filter_by(staff_id=user_id).delete()
        Booking.query.filter_by(staff_id=user_id).delete()
        db.session.delete(user)
        db.session.commit()
    return jsonify({'success': True})

@app.route('/api/admin/packages', methods=['POST'])
@admin_required
def api_admin_packages_post():
    data = request.json
    last_pkg = Package.query.order_by(Package.id.desc()).first()
    if last_pkg:
        last_num = int(last_pkg.id[1:])
        new_id = f"p{last_num + 1}"
    else:
        new_id = "p1"
    new_package = Package(
        id=new_id,
        name=data['name']
    )
    db.session.add(new_package)
    db.session.commit()
    return jsonify({'success': True, 'package': {'id': new_package.id, 'name': new_package.name}})

@app.route('/api/admin/packages', methods=['DELETE'])
@admin_required
def api_admin_packages_delete():
    package_id = request.args.get('package_id')
    pkg = Package.query.get(package_id)
    if pkg:
        db.session.delete(pkg)
        db.session.commit()
    return jsonify({'success': True})

# ============================================
# เริ่มต้นเซิร์ฟเวอร์
# ============================================

if __name__ == '__main__':
    # สร้าง instance folder และโฟลเดอร์ data (ถ้ายังไม่มี)
    os.makedirs('instance', exist_ok=True)
    os.makedirs('data', exist_ok=True)

    # สร้างตารางทั้งหมด (ถ้ายังไม่มี)
    with app.app_context():
        db.create_all()
        # ถ้ายังไม่มีข้อมูล → ย้ายข้อมูลจาก JSON
        if User.query.count() == 0:
            migrate_from_json()

    app.run(debug=True, host='0.0.0.0', port=5000)