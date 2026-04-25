// ============================================
// ระบบจองสปา - JavaScript หลัก (ปรับปรุงสมบูรณ์)
// ============================================

// ---------- ตัวแปร Global ----------
let currentDate = new Date();
let staffList = [];
let bookings = [];
let packages = [];
let draggedBooking = null;

// ---------- ฟังก์ชันช่วยเหลือ ----------
function formatDate(date) {
    let y = date.getFullYear();
    let m = String(date.getMonth() + 1).padStart(2, '0');
    let d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function timeToMinutes(t) {
    if (!t) return 0;
    let [h, m] = t.split(':').map(Number);
    return h * 60 + (m || 0);
}

function minutesToTime(min) {
    let h = Math.floor(min / 60);
    let m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    }).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, function(c) {
        return c;
    });
}

// ---------- โหลดข้อมูลจาก API ----------
async function loadStaffList() {
    let date = formatDate(currentDate);
    let res = await fetch(`/api/staff_list?date=${date}`);
    staffList = await res.json();
    return staffList;
}

async function loadBookings() {
    let date = formatDate(currentDate);
    let res = await fetch(`/api/bookings?date=${date}`);
    bookings = await res.json();
    return bookings;
}

async function loadPackages() {
    let res = await fetch('/api/packages');
    packages = await res.json();
    return packages;
}

async function loadStaffSummary() {
    let date = formatDate(currentDate);
    let res = await fetch(`/api/staff_summary?date=${date}`);
    let summary = await res.json();
    renderStaffSummary(summary);
}

function renderStaffSummary(summary) {
    const container = document.getElementById('staffSummary');
    const contentDiv = document.getElementById('summaryContent');
    if (!container || !contentDiv) return;
    if (summary.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';
    let html = '';
    summary.forEach(s => {
        let hours = Math.floor(s.total_minutes / 60);
        let mins = s.total_minutes % 60;
        let timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        html += `<div style="background: white; border-radius: 12px; padding: 10px 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); min-width: 150px;">
                    <div style="font-weight: 700; color: #4338ca; margin-bottom: 4px;">${s.name}</div>
                    <div style="font-size: 0.85rem; color: #4b5563;">
                        <span>🧘 ${s.total_bookings} bookings</span> | 
                        <span>⏱️ ${timeStr}</span>
                    </div>
                </div>`;
    });
    contentDiv.innerHTML = html;
}

async function loadAllData() {
    await Promise.all([loadStaffList(), loadBookings(), loadPackages()]);
    updateStats();
    renderBookingTable();
    await loadStaffSummary();
}

function updateStats() {
    document.getElementById('totalBookings').innerText = bookings.length;
    let revenue = 0;
    bookings.forEach(b => {
        revenue += (b.price || 0);
    });
    document.getElementById('totalRevenue').innerText = revenue.toLocaleString() + ' THB';
    let checkedIn = staffList.filter(s => s.is_checked_in).length;
    document.getElementById('checkedInStaff').innerText = checkedIn;
}

// ---------- แสดงตารางจอง (Gantt) ----------
function renderBookingTable() {
    const container = document.getElementById('bookingTable');
    if (staffList.length === 0) {
        container.innerHTML = '<div class="loading">⚠️ No staff data available</div>';
        return;
    }

    let activeStaff = staffList.filter(s => s.is_checked_in === true);
    if (activeStaff.length === 0) {
        container.innerHTML = '<div class="loading" style="text-align:center; padding: 20px;">⚠️ No Staff Checkin today</div>';
        return;
    }

    let minStartMinutes = 9 * 60;
    let maxEndMinutes = 20 * 60;

    for (let staff of activeStaff) {
        if (staff.checkout_time) {
            let mins = timeToMinutes(staff.checkout_time);
            if (mins > maxEndMinutes) maxEndMinutes = mins;
        }
    }
    bookings.forEach(b => {
        let mins = timeToMinutes(b.end_time);
        if (mins > maxEndMinutes) maxEndMinutes = mins;
    });

    let slots = [];
    for (let m = minStartMinutes; m < maxEndMinutes; m += 15) {
        slots.push(minutesToTime(m));
    }

    const slotWidth = 45;
    const staffColWidth = 160;
    const totalWidth = staffColWidth + (slots.length * slotWidth);

    let html = `<div class="booking-table-wrapper">
                <table class="booking-table" style="width:${totalWidth}px;">
                <thead>
                    <tr>
                        <th class="staff-header" style="width:${staffColWidth}px; min-width:${staffColWidth}px;">Staff</th>`;
    
    slots.forEach(s => {
        let isHour = s.endsWith(':00');
        html += `<th style="width:${slotWidth}px; min-width:${slotWidth}px; ${isHour ? 'font-weight: bold; color: #fff;' : 'color: #94a3b8; font-weight: normal; font-size: 0.7rem;'}">${isHour ? s : s.split(':')[1]}</th>`;
    });
    html += `</thead><tbody>`;

    for (let staff of activeStaff) {
        let workingHours = `${staff.checkin_time || '???'} - ${staff.checkout_time || '???'}`;
        html += `<tr class="staff-row checked-in" data-staff-id="${staff.id}">
                    <td class="staff-name-cell">
                        <div class="staff-name-text">${staff.name}</div>
                        <div class="staff-time-text">⏰ ${workingHours}</div>
                      </td>`;

        let staffBookings = bookings.filter(b => b.staff_id === staff.id);
        let slotData = new Array(slots.length).fill(null);
        
        for (let bk of staffBookings) {
            let startMin = timeToMinutes(bk.start_time);
            let endMin = timeToMinutes(bk.end_time);
            let startIdx = slots.findIndex(s => timeToMinutes(s) >= startMin);
            if (startIdx === -1) continue;
            let endIdx = slots.findIndex(s => timeToMinutes(s) >= endMin);
            if (endIdx === -1) endIdx = slots.length;
            let colspan = endIdx - startIdx;
            if (colspan < 1) colspan = 1;

            if (startIdx !== -1 && startIdx < slots.length) {
                if (slotData[startIdx] === null) {
                    slotData[startIdx] = { booking: bk, colspan: colspan, isFirst: true };
                    for (let i = startIdx + 1; i < startIdx + colspan && i < slots.length; i++) {
                        slotData[i] = { booking: bk, colspan: 0, isFirst: false };
                    }
                }
            }
        }

        let i = 0;
        while (i < slots.length) {
            let data = slotData[i];
            if (!data) {
                html += `<td class="time-slot empty" data-staff="${staff.id}" data-time="${slots[i]}" data-date="${formatDate(currentDate)}">
                            <div class="empty-slot"><span>+</span></div>
                          </td>`;
                i++;
            } else if (data.isFirst) {
                let bk = data.booking;
                let pkg = packages.find(p => p.id === bk.package_id);
                let pkgName = pkg ? pkg.name : 'No package';
                let genderSymbol = bk.customer_gender === 'male' ? '👨' : (bk.customer_gender === 'female' ? '👩' : '👤');
                let guestIcon = bk.guest_type === 'inhouse' ? '<span class="badge inhouse">In</span>' : '<span class="badge outside">Out</span>';
                let roomDisplay = bk.room_number ? ` | Room ${bk.room_number}` : '';
                
                // ----- บรรทัดที่แก้ไข: สร้าง noteDisplay พร้อม data-full-note และตัดข้อความ -----
                let noteDisplay = '';
                if (bk.note) {
                    let fullNoteEscaped = escapeHtml(bk.note).replace(/"/g, '&quot;');
                    let shortNote = escapeHtml(bk.note).substring(0, 50);
                    if (bk.note.length > 50) shortNote += '...';
                    noteDisplay = `<div class="booking-note" data-full-note="${fullNoteEscaped}">📝 ${shortNote}</div>`;
                }
                
                html += `<td colspan="${data.colspan}" class="time-slot filled" data-staff="${staff.id}" data-time="${slots[i]}" data-booking-id="${bk.id}">
                            <div class="booking-bar" draggable="true" data-booking-id="${bk.id}">
                                <div class="booking-header">
                                    <span class="customer-name">${genderSymbol} ${bk.customer_name} ${roomDisplay}</span>
                                    ${guestIcon}
                                </div>
                                <div class="package-name">💆 ${pkgName}</div>
                                <div class="booking-footer">
                                    <span class="booking-time">⏰ ${bk.start_time} - ${bk.end_time}</span>
                                    <span class="booking-price">💰 ${bk.price || 0} ฿</span>
                                </div>
                                ${noteDisplay}
                            </div>
                           </td>`;
                i += data.colspan;
            } else {
                i++;
            }
        }
        html += `</tr>`;
    }
    html += `</tbody></table></div>`;
    container.innerHTML = html;

    attachDragEvents();
    attachEmptySlotEvents();
}

// ---------- Drag & Drop ----------
function attachDragEvents() {
    document.querySelectorAll('.booking-bar[draggable="true"]').forEach(bar => {
        bar.addEventListener('dragstart', handleDragStart);
        bar.addEventListener('dragend', handleDragEnd);
    });
}

function handleDragStart(e) {
    let bar = e.target.closest('.booking-bar');
    if (!bar) return;
    draggedBooking = bar;
    e.dataTransfer.setData('text/plain', bar.dataset.bookingId);
    setTimeout(() => bar.classList.add('dragging'), 0);
}

function handleDragEnd(e) {
    if (draggedBooking) draggedBooking.classList.remove('dragging');
    draggedBooking = null;
    document.querySelectorAll('.time-slot.empty').forEach(slot => slot.classList.remove('drag-over'));
}

function attachEmptySlotEvents() {
    document.querySelectorAll('.time-slot.empty').forEach(slot => {
        slot.addEventListener('click', handleEmptyClick);
        slot.addEventListener('dragover', handleDragOver);
        slot.addEventListener('dragleave', handleDragLeave);
        slot.addEventListener('drop', handleDrop);
    });
}

function handleEmptyClick(e) {
    let slot = e.target.closest('.time-slot.empty');
    if (!slot) return;
    openAddBookingModal(slot.dataset.staff, slot.dataset.time);
}

function handleDragOver(e) {
    e.preventDefault();
    let slot = e.target.closest('.time-slot.empty');
    if (slot) slot.classList.add('drag-over');
}

function handleDragLeave(e) {
    let slot = e.target.closest('.time-slot.empty');
    if (slot) slot.classList.remove('drag-over');
}

async function handleDrop(e) {
    e.preventDefault();
    let target = e.target.closest('.time-slot.empty');
    if (!target) return;
    target.classList.remove('drag-over');
    
    let bookingId = e.dataTransfer.getData('text/plain');
    let newStaffId = target.dataset.staff;
    let newStart = target.dataset.time;
    let newDate = target.dataset.date || formatDate(currentDate);
    
    let booking = bookings.find(b => b.id === bookingId);
    if (!booking) return;
    
    let pkg = packages.find(p => p.id === booking.package_id);
    let startMin = timeToMinutes(newStart);
    let duration = booking.duration_minutes || (pkg ? pkg.duration_minutes : 60);
    let endMin = startMin + duration;
    let newEnd = minutesToTime(endMin);
    
    let conflict = bookings.some(b => b.id !== bookingId && b.staff_id === newStaffId && b.date === newDate && 
        !(timeToMinutes(b.end_time) <= startMin || timeToMinutes(b.start_time) >= endMin));
        
    if (conflict) { 
        showToast('⚠️ Booking time conflicts with another booking', 'error'); 
        return; 
    }
    
    let res = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: newStaffId, start_time: newStart, end_time: newEnd, date: newDate })
    });
    
    if (res.ok) { 
        await loadAllData(); 
        showToast('✅ Booking Successfully Moved', 'success'); 
    } else {
        showToast('❌ Failed to Move Booking', 'error');
    }
}

// ---------- Modal handling (จอง) ----------
function openAddBookingModal(staffId = null, startTime = null) {
    document.getElementById('modalTitle').innerText = 'Add New Booking';
    document.getElementById('editBookingId').value = '';
    
    ['customerName', 'roomNumber', 'note', 'durationMinutes', 'priceAmount'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('customerGender').value = 'other';
    document.getElementById('guestType').value = 'outside';
    document.getElementById('deleteBookingBtn').style.display = 'none';

    setupPackageDropdown();
    setupStaffDropdown(staffId);
    
    document.getElementById('startTime').value = startTime || '09:00';
    document.getElementById('bookingDate').value = formatDate(currentDate);
    document.getElementById('bookingModal').style.display = 'flex';
}

async function openEditBookingModal(bookingId) {
    let booking = bookings.find(b => b.id === bookingId);
    if (!booking) return;
    
    document.getElementById('modalTitle').innerText = 'Edit Booking';
    document.getElementById('editBookingId').value = bookingId;
    document.getElementById('customerName').value = booking.customer_name;
    document.getElementById('roomNumber').value = booking.room_number || '';
    document.getElementById('customerGender').value = booking.customer_gender || 'other';
    document.getElementById('guestType').value = booking.guest_type || 'outside';
    document.getElementById('note').value = booking.note || '';
    document.getElementById('durationMinutes').value = booking.duration_minutes || '';
    document.getElementById('priceAmount').value = booking.price || '';
    
    setupPackageDropdown(booking.package_id);
    setupStaffDropdown(booking.staff_id, true);
    
    document.getElementById('startTime').value = booking.start_time;
    document.getElementById('bookingDate').value = booking.date;
    document.getElementById('deleteBookingBtn').style.display = 'inline-block';
    document.getElementById('bookingModal').style.display = 'flex';
}

function setupPackageDropdown(selectedId = null) {
    let pkgSelect = document.getElementById('packageId');
    pkgSelect.innerHTML = '';
    packages.forEach(p => {
        let opt = document.createElement('option');
        opt.value = p.id;
        opt.innerText = `${p.name} (${p.duration_minutes} minutes) - ${p.price} THB`;
        opt.dataset.duration = p.duration_minutes;
        opt.dataset.price = p.price;
        if (p.id === selectedId) opt.selected = true;
        pkgSelect.appendChild(opt);
    });
    
    pkgSelect.onchange = () => {
        let selected = pkgSelect.options[pkgSelect.selectedIndex];
        document.getElementById('durationMinutes').value = selected.dataset.duration;
        document.getElementById('priceAmount').value = selected.dataset.price;
    };
    
    if (pkgSelect.options.length && !selectedId) {
        pkgSelect.onchange();
    }
}

function setupStaffDropdown(selectedId = null, includeAll = false) {
    let staffSelect = document.getElementById('staffId');
    staffSelect.innerHTML = '';
    staffList.forEach(s => {
        if (s.is_checked_in || includeAll) {
            let opt = document.createElement('option');
            opt.value = s.id;
            let timeStr = s.checkin_time ? ` (${s.checkin_time}-${s.checkout_time})` : '';
            opt.innerText = `${s.name}${timeStr}`;
            if (s.id === selectedId) opt.selected = true;
            staffSelect.appendChild(opt);
        }
    });
}

async function saveBooking() {
    let bookingId = document.getElementById('editBookingId').value;
    let data = {
        date: document.getElementById('bookingDate').value,
        staff_id: document.getElementById('staffId').value,
        start_time: document.getElementById('startTime').value,
        package_id: document.getElementById('packageId').value,
        customer_name: document.getElementById('customerName').value,
        room_number: document.getElementById('roomNumber').value,
        customer_gender: document.getElementById('customerGender').value,
        guest_type: document.getElementById('guestType').value,
        note: document.getElementById('note').value,
        duration_minutes: parseInt(document.getElementById('durationMinutes').value),
        price: parseInt(document.getElementById('priceAmount').value)
    };

    if (!data.staff_id) { showToast('Please select a staff member', 'error'); return; }
    if (!data.customer_name) { showToast('Please enter the customer name', 'error'); return; }
    
    let url = bookingId ? `/api/bookings/${bookingId}` : '/api/bookings';
    let method = bookingId ? 'PUT' : 'POST';
    
    let res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    let result = await res.json();
    
    if (res.ok) {
        showToast('✅ Booking Saved Successfully', 'success');
        document.getElementById('bookingModal').style.display = 'none';
        
        if (data.date !== formatDate(currentDate)) {
            currentDate = new Date(data.date);
            document.getElementById('selectedDate').value = formatDate(currentDate);
        }
        await loadAllData();
    } else {
        showToast('❌ Error: ' + (result.error || ''), 'error');
    }
}

async function deleteBooking() {
    let bookingId = document.getElementById('editBookingId').value;
    if (!bookingId) return;
    if (!(await customConfirm('Are you sure you want to delete this booking?'))) return;
    
    let res = await fetch(`/api/bookings/${bookingId}`, { method: 'DELETE' });
    if (res.ok) {
        showToast('✅ Booking Deleted Successfully', 'success');
        document.getElementById('bookingModal').style.display = 'none';
        await loadAllData();
    } else { 
        showToast('❌ Failed to Delete Booking', 'error'); 
    }
}

// ---------- Staff Management ----------
async function loadStaffManagement() {
    let staff = await loadStaffList();
    let html = '';
    for (let s of staff) {
        html += `<div class="staff-card ${s.is_checked_in ? 'checked-in' : ''}">
                    <div class="staff-info">
                        <h4>${s.name}</h4>
                        <div class="staff-status">${s.is_checked_in ? '✅ Checked In' : '❌ Not Checked In'} ${s.checkin_time ? ` | ${s.checkin_time} - ${s.checkout_time}` : ''}</div>
                    </div>
                    <div class="staff-actions">
                        ${!s.is_checked_in ? 
                            `<button onclick="openCheckinModal('${s.id}','${s.name}')" class="btn-primary">Check In</button>` : 
                            `<button onclick="checkoutStaff('${s.id}')" class="btn-secondary">Check Out</button>`}
                    </div>
                </div>`;
    }
    document.getElementById('staffList').innerHTML = html;
}

function openCheckinModal(id, name) {
    document.getElementById('checkinStaffId').value = id;
    document.getElementById('checkinStaffName').innerText = name;
    document.getElementById('checkinModal').style.display = 'flex';
}

async function confirmCheckin() {
    let id = document.getElementById('checkinStaffId').value;
    let cin = document.getElementById('checkinTime').value;
    let cout = document.getElementById('checkoutTime').value;
    
    if (!id || !cin || !cout) { showToast('Please fill in all fields', 'error'); return; }
    
    let res = await fetch('/api/attendance/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: id, checkin_time: cin, checkout_time: cout })
    });
    
    if (res.ok) {
        showToast('✅ Check-in Successful', 'success');
        document.getElementById('checkinModal').style.display = 'none';
        await loadStaffManagement();
        if (window.location.pathname === '/booking_chart') await loadAllData();
    } else { 
        let result = await res.json();
        showToast('❌ Check-in Failed: ' + (result.error || ''), 'error'); 
    }
}

async function checkoutStaff(id) {
    if (!(await customConfirm('Are you sure you want to check out this staff member?'))) return;
    let res = await fetch('/api/attendance/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: id })
    });
    
    if (res.ok) {
        showToast('✅ Check-out Successful', 'success');
        await loadStaffManagement();
        if (window.location.pathname === '/booking_chart') await loadAllData();
    } else { 
        showToast('❌ Check-out Failed', 'error'); 
    }
}

// ---------- Admin ----------
async function loadAdminData() {
    await loadPackages();
    await loadUsers();
    renderPackageList();
}

async function loadUsers() {
    let res = await fetch('/api/admin/users');
    let users = await res.json();
    let html = '<table class="admin-table"><thead><tr><th>Username</th><th>Name-Lastname</th><th>Role</th><th>Manage</th></tr></thead><tbody>';
    users.forEach(u => { 
        html += `<tr>
                    <td>${u.username}</td>
                    <td>${u.fullname}</td>
                    <td><span class="role-badge ${u.role}">${u.role==='admin'?'Admin':'Staff'}</span></td>
                    <td><button onclick="deleteUser('${u.id}')" class="btn-danger btn-sm">Delete</button></td>
                 </tr>`; 
    });
    html += '</tbody></table>';
    document.getElementById('userList').innerHTML = html;
}

function renderPackageList() {
    let html = '<table class="admin-table"><thead><tr><th>Package</th><th>Duration</th><th>Price</th><th>Manage</th></tr></thead><tbody>';
    packages.forEach(p => { 
        html += `<tr>
                    <td>${p.name}</td>
                    <td>${p.duration_minutes} minutes</td>
                    <td>${p.price} THB</td>
                    <td><button onclick="deletePackage('${p.id}')" class="btn-danger btn-sm">ลบ</button></td>
                 </tr>`; 
    });
    html += '</tbody></table>';
    document.getElementById('packageList').innerHTML = html;
}

async function addUser() {
    let username = document.getElementById('newUsername').value;
    let password = document.getElementById('newPassword').value;
    let fullname = document.getElementById('newFullname').value;
    let role = document.getElementById('newRole').value;
    if (!username || !password) { showToast('Please fill in Username/Password', 'error'); return; }
    let res = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, fullname, role }) });
    if (res.ok) { document.getElementById('userModal').style.display = 'none'; await loadUsers(); showToast('✅ User added successfully', 'success'); }
    else showToast('❌ Failed to add user', 'error');
}

async function deleteUser(uid) {
    if (!(await customConfirm('Delete this user?'))) return;
    await fetch(`/api/admin/users?user_id=${uid}`, { method: 'DELETE' });
    await loadUsers();
    showToast('✅ Delete successful', 'success');
}

async function addPackage() {
    let name = document.getElementById('newPackageName').value;
    let dur = document.getElementById('newPackageDuration').value;
    let price = document.getElementById('newPackagePrice').value;
    if (!name) { showToast('Please fill in Package Name', 'error'); return; }
    let res = await fetch('/api/admin/packages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, duration_minutes: dur, price }) });
    if (res.ok) { document.getElementById('packageModal').style.display = 'none'; await loadPackages(); renderPackageList(); showToast('✅ Package added successfully', 'success'); }
    else showToast('❌ Failed to add package', 'error');
}

async function deletePackage(pid) {
    if (!(await customConfirm('Delete this package?'))) return;
    await fetch(`/api/admin/packages?package_id=${pid}`, { method: 'DELETE' });
    await loadPackages();
    renderPackageList();
    showToast('✅ Delete successful', 'success');
}

// ---------- Event Listeners (รวมการปิด bookingModal ก่อนเปิด noteModal และปุ่มขยายใน modal จอง) ----------
function initEventListeners() {
    document.getElementById('prevDayBtn')?.addEventListener('click', () => { currentDate.setDate(currentDate.getDate()-1); document.getElementById('selectedDate').value = formatDate(currentDate); loadAllData(); });
    document.getElementById('nextDayBtn')?.addEventListener('click', () => { currentDate.setDate(currentDate.getDate()+1); document.getElementById('selectedDate').value = formatDate(currentDate); loadAllData(); });
    
    let dateInput = document.getElementById('selectedDate');
    if (dateInput) { 
        dateInput.value = formatDate(currentDate); 
        dateInput.addEventListener('change', (e) => { currentDate = new Date(e.target.value); loadAllData(); }); 
    }


    // ปุ่มขยายหมายเหตุภายใน modal จอง (🔍)
    const expandNoteBtn = document.getElementById('expandNoteBtn');
    if (expandNoteBtn) {
        expandNoteBtn.addEventListener('click', () => {
            const noteText = document.getElementById('note').value;
            if (noteText.trim() === '') {
                showToast('No note to display', 'info');
                return;
            }
            document.getElementById('noteFullText').innerText = noteText;
            document.getElementById('noteModal').style.display = 'flex';
        });
    }

    // ปิด modal หมายเหตุ
    const closeNoteModal = document.getElementById('closeNoteModal');
    if (closeNoteModal) {
        closeNoteModal.addEventListener('click', () => document.getElementById('noteModal').style.display = 'none');
    }
    document.querySelectorAll('.close-note-modal').forEach(btn => {
        btn.addEventListener('click', () => document.getElementById('noteModal').style.display = 'none');
    });

    document.getElementById('addBookingBtn')?.addEventListener('click', () => openAddBookingModal());
    document.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', () => document.querySelectorAll('.modal').forEach(m => m.style.display = 'none')));
    
    document.getElementById('saveBookingBtn')?.addEventListener('click', saveBooking);
    document.getElementById('deleteBookingBtn')?.addEventListener('click', deleteBooking);
    document.getElementById('confirmCheckinBtn')?.addEventListener('click', confirmCheckin);
    
    document.getElementById('addUserBtn')?.addEventListener('click', () => document.getElementById('userModal').style.display = 'flex');
    document.getElementById('confirmUserBtn')?.addEventListener('click', addUser);
    document.getElementById('addPackageBtn')?.addEventListener('click', () => document.getElementById('packageModal').style.display = 'flex');
    document.getElementById('confirmPackageBtn')?.addEventListener('click', addPackage);
    document.getElementById('cancelModalBtn')?.addEventListener('click', () => document.getElementById('bookingModal').style.display = 'none');
    
    document.addEventListener('click', (e) => { 
        let bar = e.target.closest('.booking-bar'); 
        if (bar && bar.dataset.bookingId) { 
            e.stopPropagation(); 
            openEditBookingModal(bar.dataset.bookingId); 
        } 
    });
    
    // ***** คลิกหมายเหตุในตาราง: ปิด bookingModal ก่อน แล้วเปิด noteModal *****
    document.addEventListener('click', function(e) {
        const noteDiv = e.target.closest('.booking-note');
        if (noteDiv) {
            e.stopPropagation();
            // ปิด modal แก้ไขการจองถ้ากำลังเปิดอยู่
            const bookingModal = document.getElementById('bookingModal');
                bookingModal.style.display = 'none';
            
            const fullNote = noteDiv.getAttribute('data-full-note');
            if (fullNote) {
                document.getElementById('noteFullText').innerText = fullNote;
                document.getElementById('noteModal').style.display = 'flex';
            }
        }
    });
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    const toastMsg = document.getElementById('toast-message');
    toastMsg.textContent = message;
    toast.style.backgroundColor = type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : '#334155');
    toast.style.display = 'block';
    toast.style.animation = 'none';
    toast.offsetHeight;
    toast.style.animation = null;
    setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

function customConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('customConfirmModal');
        if (!modal) { resolve(confirm(message)); return; }
        document.getElementById('confirmMessage').textContent = message;
        modal.style.display = 'flex';
        
        const cleanup = () => { 
            modal.style.display = 'none'; 
            document.getElementById('confirmOkBtn').removeEventListener('click', okHandler); 
            document.getElementById('confirmCancelBtn').removeEventListener('click', cancelHandler); 
            document.getElementById('confirmClose').removeEventListener('click', cancelHandler); 
        };
        const okHandler = () => { cleanup(); resolve(true); };
        const cancelHandler = () => { cleanup(); resolve(false); };
        
        document.getElementById('confirmOkBtn').addEventListener('click', okHandler);
        document.getElementById('confirmCancelBtn').addEventListener('click', cancelHandler);
        document.getElementById('confirmClose').addEventListener('click', cancelHandler);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    initEventListeners();
    let path = window.location.pathname;
    if (path === '/booking_chart') await loadAllData();
    else if (path === '/staff_management') await loadStaffManagement();
    else if (path === '/admin') await loadAdminData();
});