var vm = new Vue({
    el: "#app",
    mounted() {
        this.connect();
    },
    data: {
        connected: false,
        version: "",
        log: [],
        socket: null,
        config: {
            ptt: {},
            master: {},
            audio: {},
            c9000: {},
            raspager: {}
        },
        telemetry: {
            node: {},
            config: {},
            messages: {}
        },
        timeslot: 0,
        message: {
            id: "test",
            protocol: "pocsag",
            priority: 5,
            message: {
                addr: localStorage ? (parseInt(localStorage.pager_addr) || 0) : 0,
                speed: 1200,
                type: "alphanum",
                func: 3,
                data: ""
            }
        },
        auth: false,
        password: localStorage ? (localStorage.password || null) : null,
        messages: []
    },
    watch: {
        config: {
            deep: true,
            handler: function(config) {
                if (config.master.call) {
                    document.title = config.master.call + " - UniPager";
                }
                else {
                    document.title = "UniPager";
                }
            }
        },
        deep: true
    },
    methods: {
        connect: function(event) {
            this.socket = new WebSocket("ws://" + location.hostname + ":8055");
            this.socket.onopen = this.onopen;
            this.socket.onmessage = this.onmessage;
            this.socket.onclose = this.onclose;
        },
        onopen: function(event) {
            this.connected = true;
            this.log.unshift({msg: "Connected to UniPager.", time: new Date()});
            this.send({Authenticate: this.password || ""});
        },
        onmessage: function(event) {
            var response = JSON.parse(event.data) || {};
            for (var key in response) {
                var value = response[key];
                switch (key) {
                    case "Log": this.log_add(value); break;
                    case "Version": this.version = value; break;
                    case "Config": this.config = value; break;
                    case "Telemetry": this.telemetry = value; break;
                    case "TelemetryUpdate": {
                        for (key in value) {
                            this.telemetry[key] = value[key];
                        };
                        break;
                    }
                    case "Timeslot": this.timeslot = value;
                    case "Authenticated": this.authenticated(value); break;
                    case "Message": this.message_add(value); break;
                    default: console.log("Unknown Key: ", key);
                }
            }
        },
        onclose: function(event) {
            if (this.connected) {
                this.log.unshift({msg: "Disconnected from UniPager.", time: new Date()});
            }
            this.connected = false;
            this.telemetry = {
                node: {},
                config: {},
                messages: {}
            };
            setTimeout(function() { this.connect(); }.bind(this), 1000);
        },
        send: function(data) {
            this.socket.send(JSON.stringify(data));
        },
        log_add: function(record) {
            var level = record[0] || "info";
            var msg = record[1] || "";
            switch (record[0]) {
                case 1: level = "error"; break;
                case 2: level = "warn"; break;
                case 3: level = "info"; break;
                case 4: level = "debug"; break;
                case 5: level = "trace"; break;
                default: level = "info";
            }
            this.log.unshift({level: level, msg: msg, time: new Date()});
            this.log = this.log.slice(0, 50);
        },
        message_add: function(message) {
            this.messages.unshift(message);
            this.messages = this.messages.slice(0, 50);
        },
        save_config: function(event) {
            if (this.config) {
                this.send({"SetConfig": this.config});
            }
        },
        default_config: function(event) {
            this.send("DefaultConfig");
        },
        send_message: function(event) {
            localStorage && (localStorage.pager_addr = this.message.message.addr);
            this.send({"SendMessage": this.message});
        },
        test_submission: function(event) {
            this.send("Test");
        },
        authenticate: function(event) {
            this.send({"Authenticate": this.password});
            if (localStorage) {
                localStorage.password = this.password;
            }
        },
        authenticated: function(auth) {
            if (auth) {
                this.send("GetVersion");
                this.send("GetConfig");
                this.send("GetTelemetry");
                this.send("GetTimeslot");
            }
            else {
                this.password = "";
            }
            this.auth = auth;
        }
    }
});
