var apiStates = "https://cdn-api.co-vin.in/api/v1/reports/v2/getPublicReports?state_id=&district_id=&date="
var apiDistricts = (stateId) => (`https://cdn-api.co-vin.in/api/v2/admin/location/districts/${stateId}`)
var apiSlotsByDistrict = (districtId) => (`https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByDistrict?district_id=${districtId}&date=${formatDate()}:${cacheCoefficient()}`)
var apiSlotsByZip = (zipCode) => (`https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByPin?pincode=${zipCode}&date=${formatDate()}:${cacheCoefficient()}`)

var conf = { districtOrZip: "zip" }
var radioHandlers = {}
var stateSelector = document.getElementById("stateSelector")
var districtSelector = document.getElementById("districtSelector")
var zipCodeInput = document.getElementById("zipCodeInput")
var availableSlotsTBody = document.getElementById("availableSlots")
var bookedSlotsTBody = document.getElementById("bookedSlots")
var availableSlots = []
var bookedSlots = []
var interval = 5 * 1000
var intervalRunner

// NOTE: THIS VALUE CHANGES ONLY ONCE IN FIVE SECONDS
// FOR ANYBODY POLLING THE COWIN APIS, I RECOMMEND
// USING THIS COEFFICIENT LOGIC SO THAT WE ALL ARE IN SYNC
// & EACH UNIQUE REQUEST FROM EACH CLIENT DOESN'T BOMBARD THE SERVER.
function cacheCoefficient() {
	var d = Date.now() / 1000
	return d - d % 5
}

stateSelector.addEventListener('change', (e) => {
	if (!stateSelector.value) return;

	req(apiDistricts(stateSelector.value), (s, b) => {
		if (s != 200) return;

		districtSelector.innerHTML = `<option value=""> -- select state -- </option>`
		b.districts.forEach(s => {
			districtSelector.add(new Option(s.district_name, s.district_id))
		})
	})
})

districtSelector.addEventListener('change', (e) => {
	if (!districtSelector.value) return;

	findSlots()
})

zipCodeInput.addEventListener('change', (e) => {
	if (!zipCodeInput.value) return;

	findSlots()
})

radioHandlers.districtOrZip = function (e) {
	conf.districtOrZip = e.target.value
	if (e.target.value == "zip") {
		setHidden(".districtFields", true)
		setHidden(".zipFields", false)
	} else {
		setHidden(".districtFields", false)
		setHidden(".zipFields", true)
	}
	findSlots()
}

radioHandlers.ageGroup = function (e) {
	conf.ageGroup = e.target.value * 1
	renderSlots()
}

radioHandlers.brand = function (e) {
	conf.brand = e.target.value
	renderSlots()
}

radioHandlers.cost = function (e) {
	conf.cost = e.target.value
	renderSlots()
}

function setHidden(q, hidden) {
	document.querySelectorAll(q).forEach(
		el => (el.hidden = hidden)
	)
}

function req(api, cb) {
	var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function () {
		if (this.readyState != 4) return;
		var data = this.responseText
		try { data = JSON.parse(this.responseText) } catch (e) { }
		cb(this.status, data)
	};

	xhttp.open("GET", api, true);
	xhttp.send();
}

function pad(n, p) {
	n = n+""
	while(n.length < p) {
		n = "0"+n
	}
	return n
}

function formatDate(date) {
	if (!date) {
		date = new Date();
	}

	return `${pad(date.getDate(), 2)}-${pad(date.getMonth() + 1, 2)}-${date.getYear() + 1900}`
}

function parseDate(d) {
	return new Date(d.split("-").reverse().join("-"))
}

function findSlots() {
	var url;
	if (conf.districtOrZip == "zip") {
		if (!zipCodeInput.value || zipCodeInput.value.length < 6) return;
		url = apiSlotsByZip(zipCodeInput.value)
	} else {
		if (!districtSelector.value) return;
		url = apiSlotsByDistrict(districtSelector.value)
	}

	setHidden("#loader", false)
	req(url, (status, data) => {
		setHidden("#loader", true)
		if (status != 200 || !data || !data.centers) return;

		availableSlots = []
		bookedSlots = []
		var totalSlots = 0
		data.centers.forEach(c => {
			c.sessions.forEach(s => {
				if (s.available_capacity > 0) {
					availableSlots.push({ session: s, center: c })
					totalSlots += s.available_capacity
				} else {
					bookedSlots.push({ session: s, center: c })
				}
			})
		})

		availableSlots.sort((a, b) => {
			return b.session.available_capacity - a.session.available_capacity
		})

		bookedSlots.sort((a, b) => {
			aDate = parseDate(a.session.date)
			bDate = parseDate(b.session.date)
			return (aDate < bDate) ? -1 : (aDate > bDate ? 1 : 0);
		})
		document.getElementById("summary").innerText = `Total centers in area: ${data.centers.length} | Total available vaccines: ${totalSlots}`;
		renderSlots()
	})
}

function renderSlots() {
	availableSlotsTBody.innerHTML = ""
	bookedSlotsTBody.innerHTML = ""

	availableSlots.forEach(insertRows(availableSlotsTBody))
	bookedSlots.forEach(insertRows(bookedSlotsTBody))
}

function insertRows(tbodyElem) {
	return slotData => {
		if (conf.ageGroup && conf.ageGroup != slotData.session.min_age_limit) return;
		if (conf.brand && conf.brand != slotData.session.vaccine) return;
		if (conf.cost && conf.cost != slotData.center.fee_type) return;

		// Insert a row at the end of table
		var newRow = tbodyElem.insertRow();

		newRow.insertCell().innerHTML = slotData.session.available_capacity;
		newRow.insertCell().innerHTML = slotData.session.date;
		newRow.insertCell().innerHTML = `${slotData.center.name}<br><small class="text-muted">${slotData.center.pincode} | ${slotData.center.address}</small>`;
		newRow.insertCell().innerHTML = `${slotData.session.min_age_limit}yr+`;
		newRow.insertCell().innerHTML = slotData.session.vaccine;
		newRow.insertCell().innerHTML = slotData.center.fee_type;
	}
}

function startWatcher() {
	setHidden("#offlineIndicator", true)
	setHidden("#liveIndicator", false)

	findSlots()
	window.clearInterval(intervalRunner)
	intervalRunner = window.setInterval(findSlots, interval);
}

document.querySelectorAll('input[type=radio]').forEach(
	radio => radio.addEventListener('change', radioHandlers[radio.name])
);

req(apiStates, (status, body) => {
	if (status != 200) return;
	var states = body["getBeneficiariesGroupBy"]

	stateSelector.innerHTML = `<option value=""> -- select state -- </option>`
	states.forEach(s => {
		stateSelector.add(new Option(s.title, s.id))
	})
})

window.addEventListener('focus', startWatcher);
startWatcher()

window.addEventListener('blur', () => {
	setHidden("#offlineIndicator", false)
	setHidden("#liveIndicator", true)

	window.clearInterval(intervalRunner)
});
