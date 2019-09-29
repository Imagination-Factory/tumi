/*
 *     The TUMi app provides a modern way of managing events for an esn section.
 *     Copyright (C) 2019  Lukas Heddendorp
 *
 *     This program is free software: you can redistribute it and/or modify
 *     it under the terms of the GNU General Public License as published by
 *     the Free Software Foundation, either version 3 of the License, or
 *     (at your option) any later version.
 *
 *     This program is distributed in the hope that it will be useful,
 *     but WITHOUT ANY WARRANTY; without even the implied warranty of
 *     MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *     GNU General Public License for more details.
 *
 *     You should have received a copy of the GNU General Public License
 *     along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { BehaviorSubject, combineLatest, Subject } from 'rxjs';
import { filter, map, share, switchMap, takeUntil } from 'rxjs/operators';
import { EventService } from '../../shared/services/event.service';
import { MoneyService } from '../../shared/services/money.service';
import { UserService } from '../../shared/services/user.service';

@Component({
  selector: 'app-scan-request',
  templateUrl: './scan-request.component.html',
  styleUrls: ['./scan-request.component.scss']
})
export class ScanRequestComponent implements OnInit, OnDestroy {
  scanForm: FormGroup;
  destroyed$ = new Subject();
  error$ = new BehaviorSubject('');
  events$;
  user$;
  moneyControl = new FormControl();
  user;
  events;
  fullPrice = 0;

  constructor(
    private userService: UserService,
    private eventService: EventService,
    private moneyService: MoneyService,
    private dialog: MatDialogRef<ScanRequestComponent>,
    fb: FormBuilder
  ) {
    this.scanForm = fb.group({
      scan: [null, Validators.required]
    });
  }

  ngOnInit() {
    const requestObservable = this.scanForm.get('scan').valueChanges.pipe(
      filter(value => {
        let request;
        this.error$.next('');
        try {
          request = JSON.parse(value);
        } catch (e) {
          console.log(e);
          this.error$.next('The value could not be read correctly');
          return false;
        }
        if (!request) {
          this.error$.next('The value could not be read correctly');
          return false;
        }
        if (request.events.find(event => !['register', 'collectMoney', 'refund'].includes(event.action))) {
          this.error$.next(
            `Request included an unknown action (${request.events.map(event => event.action).concat(', ')})`
          );
          return false;
        }
        if (!request.user || !request.events.length) {
          this.error$.next(`The request seems to be missing data`);
          return false;
        }
        return true;
      }),
      map(value => JSON.parse(value)),
      share()
    );
    this.user$ = requestObservable.pipe(
      switchMap(request => this.userService.getUser(request.user)),
      share()
    );
    this.events$ = requestObservable.pipe(
      switchMap(value =>
        combineLatest(
          value.events.map(request =>
            this.eventService
              .getEventWithRegistrations(request.id)
              .pipe(map(event => Object.assign({}, { event, action: request.action })))
          )
        )
      ),
      share()
    );
    this.user$.pipe(takeUntil(this.destroyed$)).subscribe(user => (this.user = user));
    this.events$.pipe(takeUntil(this.destroyed$)).subscribe(events => {
      this.events = events.map(request => {
        let warning = '';
        if (request.event.userSignups.some(val => val.id === this.user.id)) {
          warning = 'User is already registered for this event!';
        }
        return { ...request, warning, userSignedUp: request.event.userSignups.some(val => val.id === this.user.id) };
      });
      if (events[0].action === 'collectMoney') {
        this.moneyControl.reset(events[0].event.fullCost);
      }
      this.fullPrice = events.reduce((acc, curr) => {
        if (curr.action === 'register') {
          return acc + curr.event.price;
        } else if (curr.action === 'collectMoney') {
          return acc - curr.event.fullCost;
        } else if (curr.action === 'refund') {
          return acc - curr.event.price;
        }
        return acc;
      }, 0);
    });
  }

  trackRequest(index, item) {
    return item.event.id;
  }

  processRefund(request) {
    if (!request.userSignedUp) {
      this.error$.next('User was not signed up for that event!');
      return;
    }
    this.moneyService.addTransaction({
      value: -request.event.price,
      comment: `Event Refund (${request.event.name}) payed to ${this.user.firstName} ${this.user.lastName} (${this.user.email})`
    });
    this.eventService.deregister(this.user, request.event);
  }

  registerUser(request) {
    if (request.event.hasFee) {
      this.moneyService.addTransaction({
        value: request.event.price,
        comment: `Event Signup (${request.event.name}) payed by ${this.user.firstName} ${this.user.lastName} (${this.user.email})`
      });
    }
    this.eventService.register(this.user, request.event);
  }

  addUserToWaitList(request) {
    if (request.event.hasFee) {
      this.moneyService.addTransaction({
        value: request.event.price,
        comment: `Wait list Signup (${request.event.name}) payed by ${this.user.firstName} ${this.user.lastName} (${this.user.email})`
      });
    }
    this.eventService.register(this.user, request.event, true);
  }

  collectMoney(request) {
    this.moneyControl.disable();
    if (this.moneyControl.value) {
      this.moneyService.addTransaction({
        value: -this.moneyControl.value,
        comment: `Event Money collected (${request.event.name}) by ${this.user.firstName} ${this.user.lastName} (${this.user.email})`
      });
    }
    this.eventService.giveOutMoney(this.user, request.event, this.moneyControl.value);
  }

  ngOnDestroy(): void {
    this.destroyed$.complete();
  }
}
