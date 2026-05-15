import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

    const firebaseConfig = {
        apiKey: "AIzaSyDgiNw5Dt6EkiokRjznzGkfZvVuDN0APPk",
        authDomain: "uhia-attendancesystem.firebaseapp.com",
        projectId: "uhia-attendancesystem",
        storageBucket: "uhia-attendancesystem.firebasestorage.app",
        messagingSenderId: "104444545133",
        appId: "1:104444545133:web:f40607b93fb90a8f511764"
    };

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
// 1. جلب البيانات من الـ Session Storage
const rawData = sessionStorage.getItem('userData');
const userData = rawData ? JSON.parse(rawData) : null;
if (!userData) {
    window.location.href = "index.html";
} else {
    // التأكد من جلب الاسم بشكل صحيح حتى لو كان المخزن كائن أو نص
    const displayName = userData.name || userData.displayName || "مشرف";
    console.log("Logged in as:", displayName);
    
    // تحديث الاسم في السايدبار فوراً إذا كان العنصر موجوداً
    document.addEventListener('DOMContentLoaded', () => {
        const nameElem = document.getElementById('moshref-name');
        if (nameElem) nameElem.textContent = displayName;
    });
}

    const myFacs = userData?.assignedFacilities || [];
    const myGov = userData?.governorate;
    let currentShift = 'صباحي';
    let globalUsers = [];
    let globalLogs = [];
    let facilityRefData = []; 
    let myChart = null;
    let moshrefMap;
    let markersLayer = L.layerGroup();
    // تحديث الساعة والتاريخ الرقمي
    window.updateClock = function() {
        const now = new Date();
        
        // تحديث الساعة
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        if(document.getElementById('digital-clock')) {
            document.getElementById('digital-clock').textContent = `${hours}:${minutes}:${seconds}`;
        }

        // تحديث التاريخ باللغة العربية
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        if(document.getElementById('live-date')) {
            document.getElementById('live-date').textContent = now.toLocaleDateString('ar-EG', options);
        }
    }
    setInterval(updateClock, 1000);
    updateClock();
    // التحكم في ظهور القائمة الجانبية
window.toggleSidebar = () => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar.style.right === '0px') {
        sidebar.style.right = '-260px';
    } else {
        sidebar.style.right = '0px';
    }
};

// إغلاق السايدبار عند الضغط في أي مكان خارجه (للموبايل)
document.addEventListener('click', (e) => {
   
    const sidebar = document.getElementById('sidebar');
    const menuBtn = document.querySelector('.top-navbar button');
    if (window.innerWidth <= 768 && 
        !sidebar.contains(e.target) && 
        !menuBtn.contains(e.target) && 
        sidebar.style.right === '0px') {
        sidebar.style.right = '-260px';
    }
    
});
    window.createCustomIcon = (color) => {
        return new L.Icon({
            iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });
    }



    window.initMap = () => {
        if(moshrefMap) return;
        moshrefMap = L.map('moshref-map').setView([26.8206, 30.8025], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(moshrefMap);
        markersLayer.addTo(moshrefMap);
    }

    window.renderMoshrefMapMarkers = (shiftLogs) => {
        markersLayer.clearLayers();
        
        facilityRefData.filter(f => myFacs.includes(f.facilityName) && f.governorate === myGov).forEach(f => {
            if(f.lat && f.lng) {
                const hasLogin = shiftLogs.some(log => log.facility === f.facilityName && log.governorate === f.governorate);
                const markerColor = hasLogin ? 'green' : 'red';
                const statusText = hasLogin ? '<span style="color:green">متاح (حضور نشط)</span>' : '<span style="color:red">غير متاح (لا يوجد حضور)</span>';

                L.marker([f.lat, f.lng], { icon: createCustomIcon(markerColor) })
                    .bindPopup(`<b>${f.facilityName}</b><br>${f.governorate}<br>${statusText}`)
                    .addTo(markersLayer);
            }
        });
    }

    window.fetchData = async () => {
        const uSnap = await getDocs(collection(db, "UsersRegistry"));
        globalUsers = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const lSnap = await getDocs(collection(db, "AttendanceLogs"));
        globalLogs = lSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        processData();
    }

    window.changeShift = (shift) => {
        currentShift = shift;
        document.getElementById('shift-morning').classList.toggle('active', shift === 'صباحي');
        document.getElementById('shift-night').classList.toggle('active', shift === 'مسائي');
        const label = document.getElementById('current-shift-label');
        if(label) label.innerText = "عرض بيانات الوردية الـ" + shift;
        processData();
    };

    window.processData = () => {
        const selectedDateStr = new Date(document.getElementById('global-date').value).toDateString();
        const filteredLogs = globalLogs.filter(l => l.loginTime?.toDate().toDateString() === selectedDateStr);
        
        const shiftWorkforce = globalUsers.filter(u => myFacs.includes(u.facility) && u.governorate === myGov && u.shift === currentShift && u.role !== 'moshref');
        const shiftStaffIDs = shiftWorkforce.map(u => u.nationalID);
        const shiftLogs = filteredLogs.filter(l => myFacs.includes(l.facility) && l.governorate === myGov && l.shift === currentShift);

        const activeUsers = shiftLogs.filter(l => shiftStaffIDs.includes(l.nationalID) && !l.logoutTime);
        const logoutUsers = shiftLogs.filter(l => shiftStaffIDs.includes(l.nationalID) && l.logoutTime);
        const activeGuests = shiftLogs.filter(l => !shiftStaffIDs.includes(l.nationalID) && !l.logoutTime);
        const logoutGuests = shiftLogs.filter(l => !shiftStaffIDs.includes(l.nationalID) && l.logoutTime);

        renderCards(shiftWorkforce.length, activeUsers.length, logoutUsers.length, activeGuests.length, logoutGuests.length);
        renderOverviewTable(shiftWorkforce, shiftLogs);
        renderFacilityDetails(shiftWorkforce, shiftLogs);
        renderStaffTab();
        updateChart(shiftWorkforce, shiftLogs);
        renderMoshrefMapMarkers(shiftLogs);
    }

    window.renderCards = (total, uActive, uOut, gActive, gOut) => {
        document.getElementById('stats-summary').innerHTML = `
            <div class="stat-card"><h4>القوة المطلوبة</h4><p>${total}</p></div>
            <div class="stat-card" style="border-top-color: var(--success)"><h4>حضور (موظفين)</h4><p>${uActive}</p></div>
            <div class="stat-card" style="border-top-color: var(--warning)"><h4>حضور (ضيوف)</h4><p>${gActive}</p></div>
            <div class="stat-card" style="border-top-color: #64748b"><h4>إجمالي الانصراف</h4><p>${uOut + gOut}</p></div>
        `;
    }

    window.renderOverviewTable = (shiftWorkforce, shiftLogs) => {
        document.getElementById('fac-table-body').innerHTML = myFacs.map(f => {
            const req = shiftWorkforce.filter(u => u.facility === f).length;
            const pres = shiftLogs.filter(l => l.facility === f && !l.logoutTime).length;
            const diff = pres - req;
            return `<tr><td>${f}</td><td>${req}</td><td>${pres}</td><td><span class="tag ${diff<0?'tag-absent':'tag-present'}">${diff>0?'+':''}${diff}</span></td></tr>`;
        }).join('');
    }

    window.renderFacilityDetails = (shiftWorkforce, shiftLogs) => {
        let html = '';
        myFacs.forEach(fac => {
            const facStaff = shiftWorkforce.filter(u => u.facility === fac);
            const facLogs = shiftLogs.filter(l => l.facility === fac);
            const guestLogs = facLogs.filter(l => !shiftWorkforce.find(u => u.nationalID === l.nationalID));

            html += `<div class="facility-block">
                <div class="facility-title"><i class="material-icons">business</i> ${fac}</div>
                <table>
                    <thead><tr><th>الاسم</th><th>الرقم القومي</th><th>رقم الهاتف</th><th>المنشأة الأصلية</th><th>الحالة</th><th>حضور</th><th>انصراف</th></tr></thead>
                    <tbody>`;
            
            facStaff.forEach(u => {
                const log = facLogs.find(l => l.nationalID === u.nationalID);
                let statusTag = !log ? '<span class="tag tag-absent">غائب</span>' : (log.logoutTime ? '<span class="tag tag-out">انصرف</span>' : '<span class="tag tag-present">حاضر الآن</span>');
                html += `<tr><td>${u.fullName}</td><td>${u.nationalID}</td><td>${u.phoneNumber || '-'}</td><td>${u.facility}</td>
                    <td>${statusTag}</td>
                    <td>${log?.loginTime?.toDate().toLocaleTimeString('ar-EG') || '-'}
                        ${log?.loginPhoto ? `<br>
                        <div style="margin-top:5px; cursor:pointer;" onclick="showImageModal('${log.loginPhoto}')">
                            <img src="${log.loginPhoto}" style="width:40px; height:40px; border-radius:5px; border:1px solid #ddd; object-fit:cover;">
                            <br><small style="color:var(--primary); text-decoration:underline;">تكبير</small>
                        </div>` : ''}
                    </td>
                    <td>${log?.logoutTime?.toDate().toLocaleTimeString('ar-EG') || '-'}
                        ${log?.logoutPhoto ? `<br>
                        <div style="margin-top:5px; cursor:pointer;" onclick="showImageModal('${log.logoutPhoto}')">
                            <img src="${log.logoutPhoto}" style="width:40px; height:40px; border-radius:5px; border:1px solid #ddd; object-fit:cover;">
                            <br><small style="color:var(--danger); text-decoration:underline;">تكبير</small>
                        </div>` : ''}
                    </td></tr>`;
            });

            guestLogs.forEach(g => {
                const guestData = globalUsers.find(u => u.nationalID === g.nationalID);
                const orig = guestData?.facility || 'اخصائي خارجي';
                const phone = guestData?.phoneNumber || '-';
                html += `<tr><td>${g.fullName}</td><td>${g.nationalID}</td><td>${phone}</td><td><span class="tag tag-guest">${orig}</span></td>
                    <td><span class="tag tag-guest">${g.logoutTime ? 'انصرف' : 'حاضر (اخصائي خارجي)'}</span></td>
                    <td>${g.loginTime.toDate().toLocaleTimeString('ar-EG')}
                        ${g.loginPhoto ? `<br>
                        <div style="margin-top:5px; cursor:pointer;" onclick="showImageModal('${g.loginPhoto}')">
                            <img src="${g.loginPhoto}" style="width:40px; height:40px; border-radius:5px; border:1px solid #ddd; object-fit:cover;">
                            <br><small style="color:var(--primary); text-decoration:underline;">تكبير</small>
                        </div>` : ''}
                    </td>
                    <td>${g.logoutTime?.toDate().toLocaleTimeString('ar-EG') || '-'}
                        ${g.logoutPhoto ? `<br>
                        <div style="margin-top:5px; cursor:pointer;" onclick="showImageModal('${g.logoutPhoto}')">
                            <img src="${g.logoutPhoto}" style="width:40px; height:40px; border-radius:5px; border:1px solid #ddd; object-fit:cover;">
                            <br><small style="color:var(--danger); text-decoration:underline;">تكبير</small>
                        </div>` : ''}
                    </td></tr>`;
            });
            html += `</tbody></table></div>`;
        });
        document.getElementById('facility-detail-area').innerHTML = html;
    }

    window.generateTimeSeries = () => {
        const fromDate = new Date(document.getElementById('date-from').value);
        const toDate = new Date(document.getElementById('date-to').value);
        toDate.setHours(23, 59, 59);

        let summaryHtml = `<table><thead><tr><th>المنشأة</th><th>إجمالي المطلوب</th><th>حضور (صباحي)</th><th>حضور (مسائي)</th><th>إجمالي ضيوف</th><th>الصافي</th></tr></thead><tbody>`;
        let detailsHtml = '';

        myFacs.forEach(fac => {
            let facRows = '';
            let facTotals = { req:0, morn:0, night:0, guest:0, diff:0 };
            for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
                const dayStr = d.toDateString();
                const dayLogs = globalLogs.filter(l => l.facility === fac && l.governorate === myGov && l.loginTime?.toDate().toDateString() === dayStr);
                const dayStaff = globalUsers.filter(u => u.facility === fac && u.governorate === myGov && u.role !== 'moshref');
                const mReq = dayStaff.filter(u => u.shift === 'صباحي').length;
                const nReq = dayStaff.filter(u => u.shift === 'مسائي').length;
                const mPres = dayLogs.filter(l => l.shift === 'صباحي' && dayStaff.some(u => u.nationalID === l.nationalID)).length;
                const nPres = dayLogs.filter(l => l.shift === 'مسائي' && dayStaff.some(u => u.nationalID === l.nationalID)).length;
                const guests = dayLogs.filter(l => !dayStaff.some(u => u.nationalID === l.nationalID)).length;
                const dailyDiff = (mPres + nPres + guests) - (mReq + nReq);
                facRows += `<tr><td>${d.toLocaleDateString('ar-EG')}</td><td>${mReq}</td><td>${mPres}</td><td>${nReq}</td><td>${nPres}</td><td>${guests}</td><td style="font-weight:700; color:${dailyDiff<0?'var(--danger)':'var(--success)'}">${dailyDiff}</td></tr>`;
                facTotals.req += (mReq + nReq); facTotals.morn += mPres; facTotals.night += nPres; facTotals.guest += guests; facTotals.diff += dailyDiff;
            }
            summaryHtml += `<tr><td>${fac}</td><td>${facTotals.req}</td><td>${facTotals.morn}</td><td>${facTotals.night}</td><td>${facTotals.guest}</td><td>${facTotals.diff}</td></tr>`;
            detailsHtml += `<div class="data-container"><h3>تحليل منشأة: ${fac}</h3><table id="ts-table-${fac.replace(/\s/g,'_')}"><thead><tr><th>التاريخ</th><th>مطلوب(ص)</th><th>حاضر(ص)</th><th>مطلوب(م)</th><th>حاضر(م)</th><th>ضيوف</th><th>الصافي</th></tr></thead><tbody>${facRows}</tbody></table></div>`;
        });
        document.getElementById('ts-summary-table-area').innerHTML = summaryHtml + `</tbody></table>`;
        document.getElementById('ts-details-container').innerHTML = detailsHtml;
    };

    window.exportTimeSeriesExcel = () => {
        const wb = XLSX.utils.book_new();
        const summaryTable = document.querySelector('#ts-summary-table-area table');
        if(!summaryTable) return alert("يرجى عرض البيانات أولاً");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.table_to_sheet(summaryTable), "الملخص العام");
        myFacs.forEach(fac => {
            const table = document.getElementById(`ts-table-${fac.replace(/\s/g,'_')}`);
            if(table) XLSX.utils.book_append_sheet(wb, XLSX.utils.table_to_sheet(table), fac.substring(0,30));
        });
        XLSX.writeFile(wb, `UHIA_Full_Report.xlsx`);
    };

window.renderStaffTable = () => {
    const tbody = document.querySelector('#staff-table tbody');
    if (!tbody) return;

    if (globalUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">لا توجد بيانات موظفين مسجلة للمنشآت التابعة لك</td></tr>';
        return;
    }

    tbody.innerHTML = globalUsers.map(user => `
        <tr>
            <td><strong>${user.name}</strong></td>
            <td>${user.facility}</td>
            <td><span class="badge" style="background:#f1f5f9; color:#1e3a8a; padding:4px 10px; border-radius:20px;">${user.shift}</span></td>
            <td>${user.phoneNumber || '---'}</td>
            <td>
                <button class="btn-table" onclick="editUser('${user.id}')" style="background:#3b82f6; color:white; border:none; padding:5px 15px; border-radius:8px; cursor:pointer;">تعديل</button>
            </td>
        </tr>
    `).join('');
};

    window.openEditModal = (id) => {
        const u = globalUsers.find(x => x.id === id);
        document.getElementById('edit-id').value = id;
        document.getElementById('edit-name').value = u.fullName;
        document.getElementById('edit-gov').value = u.government || "";
        document.getElementById('edit-shift').value = u.shift;
        document.getElementById('edit-phone').value = u.phoneNumber || "";
        filterFacsByGov(u.government, u.facility);
        document.getElementById('editModal').style.display = 'block';
    };

    window.filterFacsByGov = (govName, selectedFac = "") => {
        const facDropdown = document.getElementById('edit-fac');
        facDropdown.innerHTML = "";
        const filtered = facilityRefData.filter(f => f.governorate === govName);
        filtered.forEach(f => {
            const opt = new Option(f.facilityName, f.facilityName);
            if(f.facilityName === selectedFac) opt.selected = true;
            facDropdown.add(opt);
        });
    };

    window.saveUserData = async () => {
        const id = document.getElementById('edit-id').value;
        const updateObj = {
            fullName: document.getElementById('edit-name').value,
            government: document.getElementById('edit-gov').value,
            facility: document.getElementById('edit-fac').value,
            shift: document.getElementById('edit-shift').value,
            phoneNumber: document.getElementById('edit-phone').value
        };
        await updateDoc(doc(db, "UsersRegistry", id), updateObj);
        alert("تم الحفظ بنجاح");
        closeModal();
        fetchData();
    };

    window.deleteUser = async (id) => {
        if(confirm("هل أنت متأكد من حذف هذا الموظف؟")) {
            await deleteDoc(doc(db, "UsersRegistry", id));
            fetchData();
        }
    };

    window.showImageModal = (base64) => {
        document.getElementById('modal-img-display').src = base64;
        document.getElementById('image-modal').style.display = 'block';
    };

    window.closeImageModal = () => {
        document.getElementById('image-modal').style.display = 'none';
    };

    window.closeModal = () => document.getElementById('editModal').style.display = 'none';

    window.updateChart = (shiftWorkforce, shiftLogs) => {
        const ctx = document.getElementById('attendanceChart').getContext('2d');
        if (myChart) myChart.destroy();
        myChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: myFacs,
                datasets: [
                    { label: 'المطلوب', data: myFacs.map(f => shiftWorkforce.filter(u => u.facility === f).length), backgroundColor: '#e2e8f0' },
                    { label: 'الحضور الفعلي', data: myFacs.map(f => shiftLogs.filter(l => l.facility === f && !l.logoutTime).length), backgroundColor: '#1e3a8a' }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
        });
    }

    window.showSec = (id) => {
        document.querySelectorAll('.section-view').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
const targetSec = document.getElementById(`sec-${id}`);
    const targetBtn = document.getElementById(`btn-${id}`);
    if(targetSec) targetSec.classList.add('active');
    if(targetBtn) targetBtn.classList.add('active');
    
    // إغلاق السايدبار تلقائياً بعد الاختيار في الموبايل
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').style.right = '-260px';
    }
        if (id === 'map-view' && moshrefMap) {
            setTimeout(() => {
                moshrefMap.invalidateSize();
            }, 200);
        }

        // التعديل هنا: إخفاء التبديل في صفحة التحليل وصفحة طاقم العمل
        if (id === 'timeseries' || id === 'staff') {
            document.querySelector('.date-picker-bar').style.display = 'none';
        } else {
            document.querySelector('.date-picker-bar').style.display = 'flex';
        }
    };

window.logoutMoshref = () => {
    if(confirm('هل أنت متأكد من تسجيل الخروج؟')) {
        sessionStorage.clear();
        window.location.href = "index.html";
    }
};
// --- دالة جلب البيانات الأساسية من Firebase ---
window.refreshData = async () => {
    try {
        console.log("جاري جلب البيانات للمنشآت:", myFacs);
        


        // 1. جلب بيانات الموظفين التابعين لهذه المنشآت فقط
        const usersSnap = await getDocs(collection(db, "UsersRegistry"));
   // أضف هذا السطر قبل الـ filter في دالة refreshData
const allUsers = usersSnap.docs.map(doc => doc.data());
console.log("كل الموظفين في القاعدة قبل التصفية:", allUsers);
        // 2. جلب سجلات الحضور لتاريخ اليوم
        const selectedDate = document.getElementById('date-filter')?.value || new Date().toISOString().split('T')[0];
        const logsSnap = await getDocs(collection(db, "AttendanceLogs"));
      // داخل دالة refreshData
// تصفية الموظفين مع تنظيف الأسماء من المسافات الزائدة
globalUsers = usersSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(u => {
        const userFac = u.facility ? u.facility.trim() : "";
        return myFacs.some(fac => fac.trim() === userFac);
    });

// تصفية السجلات بنفس الطريقة
globalLogs = logsSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(l => {
        const logFac = l.facility ? l.facility.trim() : "";
        return l.date === selectedDate && myFacs.some(fac => fac.trim() === logFac);
    });
        console.log(`تم جلب ${globalUsers.length} موظف و ${globalLogs.length} سجل حضور`);

        // 3. تحديث واجهة المستخدم
        updateDashboardStats(); // تحديث المربعات العلوية
        renderAttendanceTable(); // تحديث جدول الحضور
        renderStaffTable();     // تحديث جدول الموظفين
        updateMapMarkers();     // تحديث الخريطة
        renderChart();          // تحديث الرسم البياني

    } catch (error) {
        console.error("خطأ في جلب البيانات:", error);
        alert("حدث خطأ أثناء تحديث البيانات، يرجى المحاولة مرة أخرى.");
    }
};
    window.renderAttendanceTable = () => {
    const tbody = document.querySelector('#attendance-table tbody');
    if (!tbody) return;
    
    const shiftLogs = globalLogs.filter(l => l.shift === currentShift);
    tbody.innerHTML = shiftLogs.map(log => `
        <tr>
            <td>${log.userName}</td>
            <td>${log.facility}</td>
            <td><span class="badge-time">${log.loginTime}</span></td>
            <td>${log.logoutTime || '<span style="color:orange">مرابط</span>'}</td>
            <td>
                <button class="btn-table" onclick="viewLocation(${log.lat}, ${log.lng})">الخريطة</button>
                ${log.selfie ? `<button class="btn-table" onclick="showImageModal('${log.selfie}')">الصورة</button>` : ''}
            </td>
        </tr>
    `).join('');
}
// دالة عرض جدول طاقم العمل (الموظفين)
window.renderStaffTable = () => {
    const tbody = document.querySelector('#staff-table tbody');
    if (!tbody) return;
    
    if (globalUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">لا يوجد موظفين مسجلين لهذه المنشآت</td></tr>';
        return;
    }

    tbody.innerHTML = globalUsers.map(user => `
        <tr>
            <td>${user.name}</td>
            <td>${user.facility}</td>
            <td>${user.shift}</td>
            <td>${user.phoneNumber || 'لا يوجد'}</td>
            <td>
                <button class="btn-table" onclick="editUser('${user.id}')" style="background:#3b82f6">تعديل</button>
            </td>
        </tr>
    `).join('');
};

// دالة عرض جدول الحضور والانصراف
window.renderAttendanceTable = () => {
    const tbody = document.querySelector('#attendance-table tbody');
    if (!tbody) return;

    // تصفية السجلات بناءً على الوردية المختارة حالياً
    const shiftLogs = globalLogs.filter(l => l.shift === currentShift);

    if (shiftLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">لا يوجد سجلات حضور لهذه الوردية اليوم</td></tr>';
        return;
    }

    tbody.innerHTML = shiftLogs.map(log => `
        <tr>
            <td>${log.userName}</td>
            <td>${log.facility}</td>
            <td><span class="badge-time" style="background:#dcfce7; color:#166534; padding:4px 8px; border-radius:5px;">${log.loginTime}</span></td>
            <td>${log.logoutTime ? `<span class="badge-time" style="background:#fee2e2; color:#991b1b; padding:4px 8px; border-radius:5px;">${log.logoutTime}</span>` : '<span style="color:#f59e0b; font-weight:bold;">مرابط</span>'}</td>
            <td>
                <button class="btn-table" onclick="viewLocation(${log.lat}, ${log.lng})">الموقع</button>
                ${log.selfie ? `<button class="btn-table" onclick="showImageModal('${log.selfie}')">الصورة</button>` : ''}
            </td>
        </tr>
    `).join('');
};
// دالة عرض جدول طاقم العمل (الموظفين)
window.renderStaffTable = () => {
    const tbody = document.querySelector('#staff-table tbody');
    if (!tbody) return;
    
    if (globalUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">لا يوجد موظفين مسجلين لهذه المنشآت</td></tr>';
        return;
    }

    tbody.innerHTML = globalUsers.map(user => `
        <tr>
            <td>${user.name}</td>
            <td>${user.facility}</td>
            <td>${user.shift}</td>
            <td>${user.phoneNumber || 'لا يوجد'}</td>
            <td>
                <button class="btn-table" onclick="editUser('${user.id}')" style="background:#3b82f6">تعديل</button>
            </td>
        </tr>
    `).join('');
};
window.updateMapMarkers = () => {
    if (!moshrefMap || !markersLayer) return;
    markersLayer.clearLayers();
    // كود إضافة النقاط على الخريطة يوضع هنا لاحقاً
};

window.renderChart = () => {
    const ctx = document.getElementById('attendanceChart');
    if (!ctx) return;

    // تصفية الموظفين حسب الوردية الحالية
    const shiftWorkforce = globalUsers.filter(u => u.shift === currentShift);
    
    // تجهيز البيانات: عدد الموظفين المطلوب مقابل الحاضرين لكل منشأة
    const labels = myFacs;
    const requiredData = labels.map(fac => shiftWorkforce.filter(u => u.facility === fac).length);
    const presentData = labels.map(fac => globalLogs.filter(l => l.facility === fac && l.shift === currentShift && !l.logoutTime).length);

    if (myChart) myChart.destroy(); // حذف الرسم القديم قبل إنشاء الجديد

    myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'القوة المطلوبة',
                    data: requiredData,
                    backgroundColor: '#e2e8f0',
                    borderRadius: 5
                },
                {
                    label: 'الحضور الفعلي',
                    data: presentData,
                    backgroundColor: '#1e3a8a',
                    borderRadius: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            },
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: 'Cairo' } } }
            }
        }
    });
};
// دالة عرض جدول الحضور والانصراف
window.renderAttendanceTable = () => {
    const tbody = document.querySelector('#attendance-table tbody');
    if (!tbody) return;

    // تصفية السجلات بناءً على الوردية المختارة حالياً
    const shiftLogs = globalLogs.filter(l => l.shift === currentShift);

    if (shiftLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">لا يوجد سجلات حضور لهذه الوردية اليوم</td></tr>';
        return;
    }

    tbody.innerHTML = shiftLogs.map(log => `
        <tr>
            <td>${log.userName}</td>
            <td>${log.facility}</td>
            <td><span class="badge-time" style="background:#dcfce7; color:#166534; padding:4px 8px; border-radius:5px;">${log.loginTime}</span></td>
            <td>${log.logoutTime ? `<span class="badge-time" style="background:#fee2e2; color:#991b1b; padding:4px 8px; border-radius:5px;">${log.logoutTime}</span>` : '<span style="color:#f59e0b; font-weight:bold;">مرابط</span>'}</td>
            <td>
                <button class="btn-table" onclick="viewLocation(${log.lat}, ${log.lng})">الموقع</button>
                ${log.selfie ? `<button class="btn-table" onclick="showImageModal('${log.selfie}')">الصورة</button>` : ''}
            </td>
        </tr>
    `).join('');
};
// --- دالة تحديث الإحصائيات العلوية ---
window.updateDashboardStats = () => {
    const totalStaff = globalUsers.filter(u => u.shift === currentShift).length;
    const present = globalLogs.filter(l => l.shift === currentShift && !l.logoutTime).length;
    const absent = totalStaff - present;

    if(document.getElementById('stat-total')) document.getElementById('stat-total').textContent = totalStaff;
    if(document.getElementById('stat-present')) document.getElementById('stat-present').textContent = present;
    if(document.getElementById('stat-absent')) document.getElementById('stat-absent').textContent = absent < 0 ? 0 : absent;
}

// --- دالة تغيير الوردية ---
window.changeShift = (shift) => {
    currentShift = shift;
    // تحديث شكل الأزرار
    document.querySelectorAll('.shift-btn').forEach(btn => {
        btn.classList.toggle('active', btn.innerText.includes(shift));
    });
    refreshData();
};
// تنفيذ الأكواد بعد تحميل الصفحة بالكامل
document.addEventListener('DOMContentLoaded', () => {
    // 1. تحديث اسم المشرف في السايدبار
    const nameElem = document.getElementById('moshref-name');
    if (nameElem && userData) {
        nameElem.textContent = userData.name || "المشرف";
    }

    // 2. ضبط تاريخ اليوم في الفلتر (إصلاح الخطأ setting value of null)
    const dateInput = document.getElementById('date-filter');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // 3. تشغيل جلب البيانات الأولي
    if (typeof refreshData === 'function') {
        refreshData();
    }
});