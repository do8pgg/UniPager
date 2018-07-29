use std::sync::mpsc;

use tokio::runtime::Runtime;
use futures::{self, Stream, Future};
use futures::sync::mpsc::{UnboundedReceiver, UnboundedSender};
use serde_json;

use telemetry::Telemetry;
use config::Config;
use message::Message;
use timeslots::{TimeSlot, TimeSlots};

#[derive(Clone, Debug)]
pub enum Event {
    TelemetryUpdate(Telemetry),
    TelemetryPartialUpdate(serde_json::value::Value),
    Timeslot(TimeSlot),
    TimeslotsUpdate(TimeSlots),
    ConfigUpdate(Config),
    MessageReceived(Message),
    RegisterConnection(EventSender),
    RegisterWebsocket(EventSender),
    RegisterScheduler(mpsc::Sender<Event>),
    Log(u8, String)
}


pub type EventReceiver = UnboundedReceiver<Event>;
pub type EventSender = UnboundedSender<Event>;

#[derive(Clone)]
pub struct EventHandler(EventSender);

impl EventHandler {
    pub fn publish(&self, event: Event) {
        self.0.unbounded_send(event).unwrap();
    }
}

#[derive(Default)]
pub struct EventDispatcher {
    pub connection: Option<EventSender>,
    pub scheduler: Option<mpsc::Sender<Event>>,
    pub websocket: Option<EventSender>
}

impl EventDispatcher {

}

pub fn channel() -> (EventSender, EventReceiver) {
    futures::sync::mpsc::unbounded()
}

pub fn start(rt: &mut Runtime) -> EventHandler {
    let dispatcher = EventDispatcher::default();
    let (event_tx, event_rx) = channel();

    let rx_loop = event_rx.fold(dispatcher, move |mut dispatcher, event| {
        match event {
            Event::RegisterConnection(tx) => {
                dispatcher.connection = Some(tx);
            },
            Event::RegisterWebsocket(tx) => {
                dispatcher.websocket = Some(tx);
            },
            Event::RegisterScheduler(tx) => {
                dispatcher.scheduler = Some(tx);
            }
            Event::TelemetryUpdate(_) |
            Event::TelemetryPartialUpdate(_) => {
                dispatcher.websocket.as_ref().map(|tx| {
                    tx.unbounded_send(event.clone()).ok();
                });
                dispatcher.connection.as_ref().map(|tx| {
                    tx.unbounded_send(event).ok();
                });
            }
            Event::Log(_, _) | Event::Timeslot(_) => {
                dispatcher.websocket.as_ref().map(|tx| {
                    tx.unbounded_send(event).ok();
                });
            }
            Event::MessageReceived(_) => {
                dispatcher.scheduler.as_ref().map(|tx| {
                    tx.send(event.clone()).ok();
                });
                dispatcher.websocket.as_ref().map(|tx| {
                    tx.unbounded_send(event).ok();
                });
            }
            _ => {}
        };
        Ok(dispatcher)
    }).map(|_| ());

    rt.spawn(rx_loop);

    EventHandler(event_tx)
}
