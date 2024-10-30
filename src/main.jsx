import { render } from 'preact'
import './index.css'
import { Timer } from './timer.jsx'
import "preact/debug";
render(<Timer />, document.getElementById('app'))
